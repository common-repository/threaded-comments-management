/**
 * WordPress Threaded Comments
 *
 * For every comment on the admin page a WPTCComment object is created, which
 * provides functions to move the comment around and to deal with it as with 
 * a `tree`, where the comment is a root of the tree, and other comments are
 * either `parents`, `children` or are unrelated. Depending on the action,
 * certain comments - `parents` and `children` - are additionaly modified
 * to keep all the comments and `trees` in consistent and valid state.
 *
 * Except for the comments objects, there is a WPTCDropzone which represents,
 * an intermediate storage for comments, and methods provided by it, allows
 * for easy interaction with that.
 *
 * WPTCHistory remembers movements of comments, and is used to undo them if 
 * necessery. It doesn't represent any `physical` object in the DOM.
 */

var wptcObject, commentReply;

(function( $ ){

    var settings = {
        historyStorageItemsName     : "wptc-history",
        historyButtonsId            : "wptc-history",
        maxSizeOfHistory            : 50,
        dropzoneStorageItemsName    : "wptc-dropzone",
        dropzoneId                  : "wptc-dropzone",
        inDropzoneClass             : "wptc-in-dropzone",
        dropOverClass               : "wptc-drop-over",
        draggedClass                : "wptc-dragged",
        highlightTime               : 3000,
        maxSizeOfDropzone           : 20,
        maxShownInDropzone          : 10,
        numberOfCharactersShown     : 60,
        bulkMvToDropzone            : "tcMvToDropzone",
        bulkMvTo                    : "tcMvTo",
        bulkRmFromToDropzone        : "tcRmFromDropzone",
        bulkMvToRoot                : "tcMvToRoot",
    }

    //Returns a wptcCommentObject attached to a given DOM element 
    $.fn.wptc = function() {
        if( typeof this.data( "wptcCommentObject" ) == "undefined"  ){
            wptcObject.createComment( this );              
        }
        return this.data( "wptcCommentObject" );
    };

    //Sets up everything
    $.wptc = function() {

        //Hide not-root level comments
        $( "#the-comment-list tr" ).each( function(){
            var depth = $.map( $( this ).attr( 'class' ).split( " " ), function( cl ){
                if( cl.substr( 0, 5 ) == "depth" ) return cl.substr( 6 );
            });
            if( depth > 1 ) $( this ).hide();
        });
       
        //For the list of posts/pages - allow for dropping comments on them.
        $( "#the-list tr" ).each( function(){
            $( this ).droppable({
                  scope : "wptc-comments",
                  drop: function( event, ui ){
                        ui.draggable.wptc().dropTo( this, "post" );
                        $( this ).removeClass( settings.dropOverClass );
                    },
                  over: function(){$( this ).addClass( settings.dropOverClass )},
                  out: function(){$( this ).removeClass( settings.dropOverClass )},
            });
        });


	    return new WPTC();
    };

    var WPTC = function(){
        /*
         * Performs action depending on the current screen.
         */
        if( window.pagenow == "comment" ){                  
      	    editCommentWidget();
            return null; // there is no need to initialize anything
        } else if( window.pagenow != "edit-post" && window.pagenow != "edit-page" && window.pagenow != "wp-tc-edit-comments" ){         
            return null; //no comments no problem
        }

        //Reference to the object
        var $this = $( this )[0];

        //DOM elements storages
        this.wptcCommentsStorage = $( "<table />" ).appendTo( "body" ).hide();
        this.wptcCommentsStorageDropzone = $( "<ul />" ).appendTo( "body" ).hide();

        //Dropzone - intermediate storage        
        this.wptcDropzone    = new WPTCDropzone( $this );
        //History - stores a history of `moves`
        this.wptcHistory     = new WPTCHistory( $this );
        //Create WPTC Object for each comment in the DOM
        $("#the-comment-list tr").each( function(){
            new WPTCComment( $( this ).attr( 'id' ).substr( 8 ), $this );      
        });
        
        //Restore states of history and dropzone from local storage.
        this.wptcDropzone.restore();       
        this.wptcHistory.restore();        
        
        //Minimum number of comments shown when expanding a thread
        this.expandingMinimum = 20;



        onScreenOptions();
        editCommentWidget(); // we need it to support `inspection`

        this.createComment = function( $comment ){
            new WPTCComment( $comment.attr( 'id' ).substr( 8 ), $this );  
        }

        /**
         * Class WPTCComment
         * 
         * Represents a WordPress comment.
         * @param commentIdOrData   either id of a comment or it's data
         * @param wptcO             reference to a WPTC object
         * @param callback          function called after object has been 
         *                          created and inserted into DOM
         */
        function WPTCComment( commentIdOrData, wptcO, callback ){
            var $this = $( this )[0];

            var properties = {
                "status"    : null, //none, dropzone, list, history
                "children"  : null,
                "parents"   : null,
                "remote"    : false, //comment doesn't exist in the DOM
            };

            //Comment data
            var data = {
                "commentId"             : 0,
                "commentParentId"       : 0,
                "commentParentAuthor"   : '',
                "defaults"              : true,        
            };

            //Html code of a comment
            var $dom = {
                "history" : "",
                "list"    : "",        
            };

            /**
             * Loads comment's data and generates html code.
             * If comment exists locally will create the object using data
             * contained in html code, if the data has been passed as 
             * an argument will create object from it, otherwise will send 
             * ajax request to get necessery data.
             */
            function construct(){
                if( typeof( commentIdOrData ) == "object" ){
                    data = commentIdOrData;
                } else {
                    data["commentId"] = commentIdOrData;
                }

                var $comment = $( "#comment-" + data["commentId"] );
                
                var retrievedHTML = false;                
                var html = '';

                if( $comment.length ){
                    html = $comment.get();
                    retrievedHTML = true;
                }

                if( !retrievedHTML ){
                    html = generateHTML();
                    if(html){ 
                        retrievedHTML = true;
                    }
                } 

                $.when(
                    ajaxGetThread(
                    {
                        c: $this.getData( "commentId" ), 
                        single: true
                    },
                    {
                        dataFilter: function( d, t ){
                            d = JSON.parse( d );
                            data = WPTCComment.convertDataForClient( d[0] );
                            return JSON.stringify( data );
                        }
                    }, retrievedHTML )
                ).done( function( htmlR ){
                    
                    /**
                     * If html code hasn't been generated yet, create it using
                     * data from ajax call.
                     */
                    if( !html ){
                        data["defaults"] = false;
                        properties["remote"] = true;
                        data = htmlR;
                        html = generateHTML();                                   
                    }

                    if( data["defaults"] ){
                        data = WPTCComment.readDataFromHTML( html );                
                    }

                    // Attach generated html code to DOM
                    if( $comment.length == 0 ){ 
                        $dom["list"] = $( html ).appendTo( wptcO.wptcCommentsStorage );
                    } else { 
                        $dom["list"] = $comment;
                    }

                    $dom["dropzone"] = $( wptcO.wptcDropzone.generateHTML( $this ) ).appendTo( wptcO.wptcCommentsStorageDropzone );               
                    
                    $dom["list"].data( "wptcCommentObject", $this );
                    $dom["dropzone"].data( "wptcCommentObject", $this );
                   
                    $this.draggabify().droppabify();

                    //Bind expand/collapse links                    
                    $dom["list"].find( "a.tc-show-more" ).live( "click", function(){ $this.expandSubthread()} );
                    $dom["list"].find( "a.tc-show-less" ).live( "click", function(){ $this.collapseSubthread()} );

                    //If there was any callback passed, call it.
                    if( callback ){
                        callback( $this, $dom["list"] );
                    }                
                });        
            }

            /**
             * Convert data sent from server to client form.
             * @param serverData    data sent from server
             * @param remote        if comment is completely remote, i.e. if it 
             *                      doesn't exists in DOM naturally
             * @return converted data
             */
            WPTCComment.convertDataForClient = function( serverData, remote ){
                return {
                   'commentId'             : serverData['comment_ID'],
                   'commentAuthorAvatar'   : serverData['comment_author_avatar'],
                   'commentAuthorEmail'    : serverData['comment_author_email'],
                   'commentAuthorUrl'      : serverData['comment_author_url'],
                   'commentAuthor'         : serverData['comment_author'],
                   'commentText'           : serverData['comment_content'],
                   'commentParentId'       : serverData['comment_parent'],
                   'commentParentAuthor'   : ( serverData['comment_parent_author'] ) ? serverData['comment_parent_author'] : '',    
                   'commentDate'           : serverData['comment_date'],
                   'commentDateFormatted'  : ( serverData['comment_date_formatted'] ) ? serverData['comment_date_formatted'] : serverData['comment_date'],
                   'commentDepth'          : ( serverData['comment_depth'] ) ? parseInt( serverData['comment_depth'] ) : 1,
                   'commentNoc'            : ( serverData['number_of_children'] ) ? parseInt( serverData['number_of_children'] ) : 0,
                   'commentStatus'         : serverData['comment_approved'],
                   'commentWithSubthread'  : true,
                   'commentWpNonceMove'    : serverData['wp_nonce_move'],
                   'commentWpNonceDel'     : serverData['wp_nonce_del'],
                   'commentWpNonceApprove' : serverData['wp_nonce_approve'],
                   'postId'                : serverData['comment_post_ID'],
                   'commentRemote'         : ( remote ) ? remote : false,
                   'commentAuthorIP'       : serverData['comment_author_IP'],
                   'defaults'              : false,
              };      
            }

            /**
             * Convert data contained in html code.
             * @param html          html code of a comment
             * @return retrieved data
             */
            WPTCComment.readDataFromHTML = function( html ){
              var $comment = $(html);
              var commentId = data['commentId'];    
              var $commentParent = $comment.find( 'td.comment .comment-parent' );
              var commentAuthorAvatar = $comment.find( '.column-author strong img' ).attr( 'src' );
              var commentAuthorUrl    = $comment.find( 'td.comment .author-url' ).text();
              var commentAuthorEmail  = $comment.find( 'td.comment .author-email' ).text();
              var commentAuthor       = $comment.find( 'td.comment .author' ).text();
              var commentText         = $comment.find( 'td.comment .comment' ).val();
              var commentParentId     = ( $commentParent[0] ) ? $.map($commentParent.attr( 'class' ).split(" "), function(val){if( val.substr( 0, 17 ) == "comment-parent-id" ) return val.substr( 18 )} )[0] : 0;
              var commentParentAuthor = ( $commentParent[0] ) ? $commentParent.text() : '';
              var commentStatus       = $comment.find( 'td.comment .comment_status' ).text();
              var commentDate         = $comment.find( '.comment-submitted-on' ).text();
              var commentDateFormatted = commentDate;
              var commentDepth        = $.map( $comment.attr( 'class' ).split( " " ), function( val ){if( val.substr(0, 5) == "depth" ) return val.substr( 6 )} )[0];
              var commentNoc          = parseInt( $comment.find( '.comment-noc' ).text() );  
              var commentWpNonceMove  = $( '#comment-tc-move-nonce-' + commentId ).text();
              var postId              = 0;              
            
              /**
               * Get comment's post id, it is stored in different places
               * depending on which site we are.
               */
              postId = $("#comments-form input[name='p']");
              if( postId.length ){
                postId = postId.val();
              } else {
                var thisPostComCount = $comment.find( ".post-com-count" );
                var thisPostIdPos = thisPostComCount.attr( "href" ).search(/p=/i) + 2;
                postId = parseInt( thisPostComCount.attr( "href" ).substr( thisPostIdPos ) );
              }              

              if( !commentNoc ) commentNoc = 0;

              var retrievedData = {
                   'commentId'             : commentId,
                   'commentAuthorAvatar'   : commentAuthorAvatar,
                   'commentAuthorEmail'    : commentAuthorEmail,
                   'commentAuthorUrl'      : commentAuthorUrl,
                   'commentAuthor'         : commentAuthor,
                   'commentText'           : commentText,
                   'commentParentId'       : commentParentId,
                   'commentParentAuthor'   : commentParentAuthor,    
                   'commentDate'           : commentDate,
                   'commentDateFormatted'  : commentDateFormatted,
                   'commentDepth'          : parseInt(commentDepth),
                   'commentNoc'            : commentNoc,
                   'commentStatus'         : commentStatus,
                   'commentWithSubthread'  : true,
                   'commentWpNonceMove'    : commentWpNonceMove,
                   'postId'                : postId,
                   'defaults'              : false,
                   'commentRemote'         : false,
              };        
            return retrievedData;
            }

            

            /**
             * Makes comment draggable.
             * @return this comment object
             */
            this.draggabify = function(){
                $dom["dropzone"].draggable({ 
                    revert : true, 
                    scope : "wptc-comments", 
                    cursor: "move",
                    disabled: false,
                    distance: 10,
                    start: function(){$( this ).addClass( settings.draggedClass );},
                    stop: function(){$( this ).removeClass( settings.draggedClass );},
                }).addClass( "wptc-draggable" );

                $dom["list"].draggable({ 
                    revert : true, 
                    scope : "wptc-comments", 
                    cursor: "move",
                    distance: 10,
                    //Creates a helper object required to drag rows.
                    helper: function(event){ 
                         var $row = $(event.target).closest( "tr" ).clone( true );
                         var commentId = $(event.target).closest( "tr" ).wptc().getData( "commentId" );
                         $row.attr("id", ""); //avoid multiple ids
                         return $( "<div class='wptc-drag-comment wptc-dragged'><table class='widefat comments'></table></div>" ).find( "table" ).append($row).end().appendTo( "body" );
                    },
                    /**
                     * When statring dragging, create to helping drop areas:
                     *  - mobile-rootzone for easy rooting
                     *  - mobile-dropzone for easy moving to the dropzone
                     */
                    start: function( event ){
                         var $row = $( event.target ).closest( "tr" );
                       $( "<tr id='wptc-mobile-dropzone' class='wptc-special-drop'><td></td><td>" + objectL10n.dropzone + "</td><td></td></tr>" ).hide().insertBefore( $row ).fadeIn( "slow" );
                         
                        if( $row.wptc().getData( "commentParentId" ) ) {
                            $( "<tr id='wptc-mobile-rootzone' class='wptc-special-drop'><td></td><td>" + objectL10n.rootTheComment + "</td><td></td></tr>" ).hide().insertAfter( $row ).fadeIn( "slow" );
                         }
                         
                         $( "#wptc-mobile-dropzone" ).droppable({
                            scope : "wptc-comments",
                            drop: function( event, ui ){
                                ui.draggable.wptc().dropTo( null, "dropzone" );
                                $( "#wptc-mobile-dropzone, #wptc-mobile-rootzone" ).fadeOut( "slow", function() { 
                                    $( this ).remove(); 
                                });
                            },
                            over: function(){
                                $( this ).addClass( settings.dropOverClass );
                            },
                            out: function(){
                                $( this ).removeClass( settings.dropOverClass );
                            },
                         });

                         $( "#wptc-mobile-rootzone" ).droppable({
                            scope : "wptc-comments",
                            drop: function(event, ui){
                                ui.draggable.wptc().dropTo( null, "root" );
                                $( "#wptc-mobile-dropzone, #wptc-mobile-rootzone" ).fadeOut( "slow" , function() { 
                                    $( this ).remove(); 
                                });
                            },
                            over: function(){
                                $( this ).addClass( settings.dropOverClass );
                            },
                            out: function(){
                                $( this ).removeClass( settings.dropOverClass );
                            },
                         });
                    },
                    stop: function(event){
                         var $row = $(event.target).closest( "tr" );
                         $( "#wptc-mobile-dropzone, #wptc-mobile-rootzone" ).fadeOut( "slow" , function() { 
                            $( this ).remove(); 
                        });                 
                    },
                    disabled: false,
               }).addClass( "wptc-draggable" );
                return this;
            }
            
            /**
             * Makes comment not draggable.
             * @param type makes either 'dropzone' or 'list' not draggable
             * @return this comment object
             */
            this.dedraggabify = function(type){
                $dom[type].draggable( "option", "disabled", true ).removeClass( "wptc-draggable" );
                return this;
            }

            /**
             * Makes comment a target for dropping comments.
             * @return this comment object
             */
            this.droppabify = function(){
                $dom["list"].droppable({
                    scope: "wptc-comments",
                    drop: function( event, ui ){
                        ui.draggable.wptc().dropTo( $this, 'comment' );
                        ui.draggable.wptc().jq().removeClass( settings.dropOverClass );
                        $( this ).removeClass( settings.dropOverClass );
                    },
                    over: function(){
                        $( this ).addClass( settings.dropOverClass );
                    },
                    out: function(){
                        $( this ).removeClass( settings.dropOverClass );
                    },
                    disabled: false,
                }).addClass( "wptc-droppable" );
                return this;
            }

            /**
             * Other comments can no longer be dropped onto this comment.
             * @return this comment object
             */
            this.dedroppabify = function(){
                $dom["list"].droppable( "option", "disabled", true ).removeClass( "wptc-droppable" );
                return this;
            }

            /**
             * Returns comment's data.
             * @param   d one of comment's data fields
             * @return  if d is set returns this data field
             *          otherwise returns all data fields
             */
            this.getData = function( d ){
                if( !d ){
                    return data;            
                } else {
                    return data[d];            
                }
            }
            
            
            /**
             * Sets value of a data field.
             * @param d name of a data fields
             * @param v value of the data field
             * @return  returns this data field
             */
            this.setData = function( d, v ){
                return data[d] = v;
            }

            /**
             * Makes comment's html code visible.
             * @param type  dropzone | list
             * @return      returns this objects
             */
            function appear(type){
                if(!type) $dom[properties['status']].show();
                else $dom[type].show();        
                return this;        
            }

            /**
             * Hides comment's html code.
             * @param type  dropzone | list
             * @return      returns this objects
             */
            function disappear(type){
                if(!type) $dom[properties['status']].hide();
                else $dom[type].hide();
                return this;          
            }

            /**
             * Dropps comment onto another one.
             * @param comment either null or comment object, or post's html code
             * @param type  dropzone    - comment is added to dropzone
             *              root        - comment is rooted
             *              post        - comment is moved to another post
             *              otherwise   - comment is set as comment's parent
             *               
             * @return      returns this objects
             */
            this.dropTo = function(comment, type){
                $this.moveTo(comment, type);
            }

            /**
             * Comment is dropped onto this comment.
             * @param type  dropzone    - comment is added to dropzone
             *              root        - comment is rooted
             *              post        - comment is moved to another post
             *              otherwise   - comment is set as comment's parent
             *               
             * @return      returns this objects
             */
            this.drop = function(type){
                $this.move(comment, type);
            }

            /**
             * Comment is set as a parent for another comment.
             * @param comment either null or comment object, or post's html code
             * @param type  dropzone    - comment is added to dropzone
             *              root        - comment is rooted
             *              post        - comment is moved to another post
             *              otherwise   - comment is set as comment's parent
             *               
             * @return      returns this objects
             */           
            this.move = function( comment, type ){
                comment.moveTo( $this, type );
                return this;
            }

            /**
             * Another comment is set as a parent for this comment.
             * @param comment either null or comment object, or post's html code
             * @param type  dropzone    - comment is added to dropzone
             *              root        - comment is rooted
             *              post        - comment is moved to another post
             *              otherwise   - comment is set as comment's parent
             *               
             * @return      returns this objects
             */ 
            this.moveTo = function( comment, type ){
               if( type == "dropzone" ){
                    //add comment to dropzone.
                    wptcO.wptcDropzone.put( $this );
                    $this.setProperty( "status", "dropzone" );
                    $this.jq().draggable( "option", "disabled", true );            
                } else if( type == 'root' ){
                    /**
                     * The same as for a normal comment but parentID = 0, 
                     * parentAuthor = '', depth = 1, and insert in the 
                     * chronologically correct order or hide.
                     */ 
                    disappear( "list" );
                    var newParentId = 0;
                    var newParentAuthor = '';                
                    var newPostId = $this.getData( 'postId' );
                    //How much should depth be modified
                    var depthMod = 1 -  parseInt( data["commentDepth"] );      
                    //How much should number of children be modified                    
                    var nocMod = $this.children().length + 1;

                    var oldPostId = data["postId"];
                    var oldParentId = data["commentParentId"];

                    //MOVE
                    ajaxMove(data["commentId"], newParentId, newPostId, $this.getData( "commentWpNonceMove" ));

                    //Fix old parents
                    $.each( $this.parents(), function( index, parent ){                      
                        parent.setProperty( 'children', null );                         
                        parent.fixChildren( - nocMod );                        
                    });

                    //Change data
                    $this.setData( "commentParentId", newParentId );
                    $this.setData( "commentParentAuthor", newParentAuthor );
                    $this.setData( "postId", newPostId );

                    //Fix the comment's html
                    fixParents();

                    //Fix depth for itself and every child, and add classes
                    var children = $this.children();
                    
                    $dom['list'].addClass( 'wptc-inspected' );
                    setTimeout( function() { $dom['list'].removeClass( 'wptc-inspected' ) }, settings.highlightTime );

                    $this.fixDepth( depthMod );
                    $.each( children, function( index, child ){ 
                        child.fixDepth( depthMod );
                        child.setProperty( 'parents', null ); 
                        child.jq().addClass( 'wptc-inspected-thread' );
                        setTimeout( function() { child.jq().removeClass( 'wptc-inspected-thread' ) }, settings.highlightTime );
                    });

                    /**
                     * We want to insert the comment into the list in the right place,
                     * to keep the order, so we have to find an older element. 
                     */
                    var inserted = false;
                    $( "tr.depth-1:not(.wptc-special-drop)", theList ).each( function(){
                        var comment = $( this ).wptc();

                        var thisTime =  $this.getData( 'commentDateFormatted' ).split( ' ' );
                        var thisDate = thisTime[0].split( '/' );
                        thisTime = thisTime[2].split( ':' );                       
                        var thisDateTime = new Date( thisDate[0], thisDate[1] - 1, thisDate[2], thisTime[0], thisTime[1], 0 );
                        
                        var thatTime =  comment.getData( 'commentDateFormatted' ).split( ' ' );
                        var thatDate = thatTime[0].split( '/' );
                        thatTime = thatTime[2].split( ':' );                       
                        var thatDateTime = new Date( thatDate[0], thatDate[1] - 1, thatDate[2], thatTime[0], thatTime[1], 0 );

                        if( thatDateTime.getTime() < thisDateTime.getTime()){
                            inserted = true;

                            var ia = $dom['list'].insertBefore( this );
                           
                            $.each(children, function( index, child ){
                                ia = child.jq().insertAfter( ia );
                            });

                            return false;                    
                        } 
                    });

                    // We haven't found a place, which means that the comment is the freshest one 
                    if( ! inserted ){
                        var ia = $dom['list'].prependTo( $( "#the-comment-list" ) );
                       
                        $.each(children, function( index, child ){
                            ia = child.jq().insertAfter( ia );
                        });
                    }

                    properties['parents'] = null // set to invalid

                    /**
                     * Create entry in the history.
                     */
                    wptcO.wptcHistory.put( {
                        "commentId" : data["commentId"],
                        "oldParentId" : oldParentId,
                        "oldPostId" : oldPostId,
                        "newParentId" : newParentId,
                        "newPostId" : newPostId,
                        "commentWpNonceMove" : $this.getData( "commentWpNonceMove" ),
                        } );

                    
                    /**
                     * If the comment has been moved from the dropzone,
                     * remove it from the dropzone.
                     */
                    if( properties['status'] == 'dropzone' ){
                        wptcO.wptcDropzone.remove(this);
                        properties['status'] = 'list';
                        $this.jq().draggable( "option", "disabled", false );
                    } 

                    appear( 'list' );
                } else if( type == 'post' ) {
                    /**
                     * We're moving the comment to another post.
                     */
                    var newParentId = 0;
                    var newParentAuthor = '';                
                    var newPostId = $( comment ).attr( 'id' ).substr( 5 );
                    
                    //How much should depth be modified
                    var depthMod = 1 -  data["commentDepth"];

                    var oldPostId = data["postId"];
                    var oldParentId = data["commentParentId"];

                    //MOVE
                    ajaxMove( data["commentId"], newParentId, newPostId, $this.getData( "commentWpNonceMove" ) );

                    //Change data
                    $this.setData( "commentParentId", newParentId );
                    $this.setData( "commentParentAuthor", newParentAuthor );
                    $this.setData( "postId", newPostId );

                    //Fix the comment's html
                    fixParents();
                    $this.fixDepth( depthMod );
    
                    /**
                     * If the comment has been moved between posts, a comment 
                     * counter for each affected post/comment has to be updated.
                     */
                    if( newPostId != oldPostId ){
                        fixCommentsCounters( oldPostId, newPostId, $this.getData( "commentNoc" ) + 1);
                    }

                    properties['parents'] = null // set to invalid

                    /**
                     * Create entry in the history.
                     */
                    wptcO.wptcHistory.put( {
                        "commentId" : data["commentId"],
                        "oldParentId" : oldParentId,
                        "oldPostId" : oldPostId,
                        "newParentId" : newParentId,
                        "newPostId" : newPostId,
                        "commentWpNonceMove" : $this.getData( "commentWpNonceMove" ),
                        } );
                    
                    /**
                     * If the comment has been moved from the dropzone,
                     * remove it from the dropzone.
                     */
                    if( properties['status'] == 'dropzone' ){
                        wptcO.wptcDropzone.remove( this );
                        properties['status'] = 'list';
                        $this.jq().draggable( "option", "disabled", false );
                    } 
            } else {
                    disappear( "list" );
                    var newParentId = comment.getData( 'commentId' );
                    var newParentAuthor = comment.getData( 'commentAuthor' );                
                    var newPostId = comment.getData( 'postId' );
     
                    //How much should number of children be modified                    
                    var nocMod = $this.getData( "commentNoc" ) + 1;
                    //How much should depth be modified
                    var depthMod = comment.getData( "commentDepth" ) - data["commentDepth"] + 1;

                    var oldPostId = data["postId"];
                    var oldParentId = data["commentParentId"];

                    //Do not allow for reparenting comment to itself
                    if( newParentId == $this.getData( "commentId" ) ){
                        appear( "list" );
                        return this;
                    }        

                    //Do not allow for reparenting comment to its child
                    var children = $this.children();
                    var isAChild = false;
                    $.each( children, function( index, child ){
                        if( child.getData( "commentId" ) == $this.getData( "commentId" ) ){
                            isAChild = true;
                            return false;                        
                        }
                    });

                    if( isAChild ){
                        appear( "list" ) ;
                        return this;
                    } 

                    //MOVE
                    var move = ajaxMove( data["commentId"], newParentId, newPostId, $this.getData( "commentWpNonceMove" ) );

                    //Fix old parents
                    if( !this.getProperty( 'remote' ) ){
                       $.each( $this.parents(), function( index, parent ){                      
                            parent.setProperty( 'children', null );                         
                            parent.fixChildren( - nocMod);                        
                        });
                    }

                    //Change data
                    $this.setData( "commentParentId", newParentId );
                    $this.setData( "commentParentAuthor", newParentAuthor );
                    $this.setData( "postId", newPostId );

                    //Fix the comment's html
                    fixParents();

                    //Fix comment's and childrens' depth
                    var children = $this.children();
                    $this.fixDepth( depthMod );
                    $.each(children, function( index, child ){ 
                        child.fixDepth( depthMod );
                        child.setProperty( 'parents', null ); 
                    });

                    //Move
                    children = $this.children();
                    var ia = $dom['list'].insertAfter( comment.jq( 'list' ) ).addClass( 'wptc-inspected' );
                    setTimeout( function() { $dom['list'].removeClass( 'wptc-inspected' ) }, settings.highlightTime );

                    $.each( children, function( index, child ){
                        ia = child.jq().insertAfter( ia ).addClass( 'wptc-inspected-thread' );
                        setTimeout( function() { child.jq().removeClass( 'wptc-inspected-thread' ) }, settings.highlightTime );
                    });

                    $this.setProperty( 'parents', null ); // set to invalid

                    //Fix new parents
                    $.each( $this.parents(), function( index, parent ){
                        parent.setProperty( 'children' , null );
                        parent.fixChildren( nocMod );
                    });

                    //Fix comments counters (if post has changed)
                    if( newPostId != oldPostId ){
                        fixCommentsCounters( oldPostId, newPostId, $this.getData( "commentNoc" ) + 1 );
                        fixResponseColumn( comment );
                    }

                    /**
                     * Create entry in the history
                     */
                    wptcO.wptcHistory.put( {
                        "commentId" : data["commentId"],
                        "oldParentId" : oldParentId,
                        "oldPostId" : oldPostId,
                        "newParentId" : newParentId,
                        "newPostId" : newPostId,
                        "commentWpNonceMove" : $this.getData( "commentWpNonceMove" ),
                        } );

                    /**
                     * If the comment is fully remote, and has been created from
                     * data sent from server, when moving we have to get its
                     * subthread and insert it into DOM along with the comment.
                     */
                    if( this.getProperty( 'remote' ) ){
                        move.done( ajaxGetThread(
                            {
                                action: 'get-comment-subthread',
			                    single: 'false',
			                    c: data["commentId"],
                               returncommentsubthread: 'true',
                            },
                            {
                                "dataFilter" : function( d, t ){
                                        d = JSON.parse( d );
                                        d = d[0];
                                        var ajaxData = [];
                                        for( var i = 1; i < d.length; i++ ){               
                                            ajaxData.push( WPTCComment.convertDataForClient( d[i] ) );
                                        }
                                        return JSON.stringify( ajaxData );
                                    },
                            }
                        ).done( function( ajaxData ){
                            console.debug( $dom["list"] );

                            if( ajaxData ){
                                var ia = $this.jq();
                                
                                for( var i = 0; i < ajaxData.length; i++ ){
                                    var c = new WPTCComment( ajaxData[i], wptcO, function( comment, html ){
                                        ia = html.insertAfter( ia );
                                        comment.setProperty( 'children', null );
                                        comment.setProperty( 'parents', null );
                                    });

                                }
                                
                                $this.setProperty( 'children', null );
                            }
                        }));
                    }

                    if( $this.getProperty( 'status' ) == 'dropzone' ){
                        wptcO.wptcDropzone.remove( $this );
                        $this.setProperty( 'status', "list" );
                        $this.jq().draggable( "option", "disabled", false );
                    } 

                    appear( "list" );
                }
                return this;
            }

            /**
             * Returns comment's properties.
             * @param   p one of comment's property fields
             * @return  if p is set returns this property field
             *          otherwise returns all property fields
             */
            this.getProperty = function( p ){
                if( !p ){
                    return properties
                } else {    
                    return properties[p];
                }            
            }
            
            /**
             * Sets value of a property field.
             * @param p name of a property fields
             * @param v value of the property field
             * @return  returns this property field
             */
            this.setProperty = function( p, v ){
                return properties[p] = v;      
            }

            
            /**
             * Returns array of comment's objects which are lower in a thread, 
             * for which the comment is the root.
             * @return array of children.
             */
            this.children = function(){
                /**
                 * We take all elements until one which is a direct reply to a post,
                 * and then we also add that one.
                 */
                var kids = $dom["list"].nextUntil( "tr.depth-" + $this.getData( 'commentDepth' ),"tr:not(.wptc-special-drop)" ).map( function( index, comment ){
                    var co = $(comment).data( 'wptcCommentObject' );                       
                    if( co.getData( 'commentDepth' ) > $this.getData( 'commentDepth' ) ) return co;
                });
                properties["children"] = kids;
                return properties["children"];
            }

            // Executes `constructor`
            construct();

            /**
             * Modifies `In reply to` element of the comment.
             * @return this comment objects
             */
            function fixParents(){
                var inReplyToHTML        = "<span class='comment-parent-span'> | " + objectL10n.inReplyTo + " <a class='comment-parent comment-parent-id-" + data["commentParentId"] + "' href='" + objectL10n.rootURL + "?p=" + data["postId"] + "#comment-" + data["commentParentId"] + "'>" + data["commentParentAuthor"] + "</a>.</span>";   
                var $commentSubmittedOn = $dom["list"].find( ".column-comment .submitted-on" );
                
                /**
                 * Two cases:
                 * - Comment is a reply     -> add | show and fix
                 * - Comment is not a reply -> hide           
                 */
                 if( data["commentParentId"] ){
                    var $cps = $commentSubmittedOn.find( ".comment-parent-span" );
                    if($cps.length){
                        $cps.show().html( inReplyToHTML );
                    } else {
                        $commentSubmittedOn.append( inReplyToHTML );
                    }
                } else {
                    $commentSubmittedOn.find( ".comment-parent-span" ).hide();    
                }
                return this;        
            }

            /**
             * Modifies `response column` by cloning it from a target.
             * @return this comment objects
             */
            function fixResponseColumn( comment ){
                var responseColumn = comment.jq().find( "td.response.column-response" ).html();
                $this.jq().find( "td.response.column-response" ).html( responseColumn );
                return this;
            }

            /**
             * Modifies `Has n replies` element and `expand/collapse` link.
             * @return this comment objects
             */
            this.fixChildren = function( mod ){
                data["commentNoc"] += parseInt( mod );
                var showDepth = parseInt( data["commentDepth"] ) + 1; 
                var hasNRepliesHTML      = "<span class='comment-noc-span'> | " + objectL10n.has + " <span class='comment-noc'>";

                if( parseInt( data["commentNoc"] ) > 1 ) { 
                    hasNRepliesHTML += data["commentNoc"] + "</span> " + objectL10n.pReplies + ".</span>";
                } else {
                    hasNRepliesHTML += " 1 </span> " + objectL10n.sReplies + ".</span>";
                }

                var expandCollapseMenu   = "<span class='expand'><a class='tc-show-less' href='#depth-" + showDepth + "'>" + objectL10n.collapse + "</a> | </span>";
                var $commentSubmittedOn = $dom["list"].find(".column-comment .submitted-on");

                /**
                 * Two cases:
                 * - Comment has replies    -> add | show and fix
                 * - Comment has no replies -> hide           
                 */
                if( data["commentNoc"] ){
                    var $noc = $commentSubmittedOn.find( ".comment-noc-span" );
                    var $ra = $dom["list"].find( ".column-comment .row-actions" );
                    if( $noc.length ){ //elements exists in dom -> fix and show
                        $noc.show().html( hasNRepliesHTML );
                        $ra.find( ".expand" ).show().find( "a" ).attr( "href", "#depth-" + showDepth );                    
                    } else { //elements have to be created and added
                        $commentSubmittedOn.append( hasNRepliesHTML );
                        $ra.prepend( expandCollapseMenu );
                    }
                } else {
                   $commentSubmittedOn.find( ".comment-noc-span" ).hide();
                   $dom["list"].find( ".column-comment .row-actions .expand" ).hide();
                }

                return this;
            }

            /**
             * Modifies comment's depth.
             * @return this comment objects
             */
            this.fixDepth = function( mod ){
                var oldDepth = parseInt( data["commentDepth"] );
                data["commentDepth"] = parseInt( oldDepth ) + parseInt( mod );
                if( $dom["list"] ){
                    $dom["list"].find( ".depth-" + oldDepth ).andSelf().removeClass( "depth-" + oldDepth ).addClass( "depth-" + data["commentDepth"] );
                }
                return this;
            }

            /**
             * Generates html from comment's data.
             * @param th should it generate threaded version of a comment or not
             * @return generated html code
             */
            function generateHTML( th ){
                var threaded = true;
                if( th === false ){
                    threaded = th;            
                }

              if( data["defaults"] ) return null; //if data hasn"t been loaded return null

              var showDepth = parseInt( data["commentDepth"] ) + 1;

              var commentTmplHTML = "<tr id='comment-" + data["commentId"] + "' class='approved depth-" + data["commentDepth"] + " droppable draggable'><th scope='row' class='check-column'><input type='checkbox' name='delete_comments[]' value='" + data["commentId"] + "'></th><td class='author column-author'><strong>" + data["commentAuthorAvatar"] + data["commentAuthor"] + "</strong><br><a href='mailto:" + data["commentAuthorEmail"] + "'>" + data["commentAuthorEmail"] + "</a><br><a href='edit-comments.php?s=" + data["commentAuthorIP"] + "&amp;mode=detail'>" + data["commentAuthorIP"] + "</a></td><td class='comment column-comment'><div class='depth-indicator depth-" + data["commentDepth"] + "'><div class='depth-padding'><div class='submitted-on'>" + objectL10n.submittedOn + " <a href='" + objectL10n.rootURL + "?p=" + data["postId"] + "#comment-" + data["commentId"] + "'>" + data["commentDateFormatted"] + "</a>";

              if( data["commentParentId"] ) commentTmplHTML += '<span class="comment-parent-span" > | ' + objectL10n.inReplyTo + ' <a href="' + objectL10n.rootURL + '?p=' + data["postId"] + '#comment-' + data['commentParentId'] + '">' + data['commentParentAuthor'] + '</a>.</span>';
              
              if( parseInt( data["commentNoc"] ) == 1 ){ 
                    commentTmplHTML += " | " + objectL10n.has + " <span class='comment-noc'>" + data["commentNoc"] + "</span>" + objectL10n.sReplies + ".";
              } else if( parseInt( data["commentNoc"] ) > 1 ){
                    commentTmplHTML += " | " + objectL10n.has + " <span class='comment-noc'>" + data["commentNoc"] + "</span>" + objectL10n.pReplies + ".";
              }
              commentTmplHTML += " </div><p>" + data["commentText"] + "</p><div id='inline-" + data["commentId"] + "' class='hidden'><textarea class='comment' rows='1' cols='1'>" + data["commentText"] + "</textarea><div class='author-email'>" + data["commentAuthorEmail"] + "</div><div class='author'>" + data["commentAuthor"] + "</div><div class='author-url'></div><div class='comment_status'>1</div></div><div class='row-actions'>";
              
              if( threaded && data["commentNoc"] ) commentTmplHTML += '<span class="expand"><a class="tc-show-less" href="#depth-' + showDepth + '">' + objectL10n.expand + '</a></span>';

              commentTmplHTML += '<span class="approve"><a href="comment.php?c=' + data['commentId'] + '&amp;action=approvecomment&amp;' + data["commentWpNonceApprove"] + '" class="dim:the-comment-list:comment-' + data['commentId'] + ':unapproved:e7e7d3:e7e7d3:new=approved vim-a" title="' + objectL10n.approveThisComment + '">' + objectL10n.approve + '</a></span><span class="unapprove"> | <a href="comment.php?c=' + data['commentId'] + '&amp;action=unapprovecomment&amp;' + data["commentWpNonceApprove"] + '" class="dim:the-comment-list:comment-' + data['commentId'] + ':unapproved:e7e7d3:e7e7d3:new=unapproved vim-u" title="' + objectL10n.unapproveThisComment + '">' + objectL10n.unapprove + '</a></span><span class="reply hide-if-no-js"> | <a onclick="commentReply.open( ' + "'" + data['commentId'] + "','" + data["postId"] + "'" + ' );return false;" class="vim-r" title="' + objectL10n.replyToThisComment + '" href="#">' + objectL10n.reply + '</a></span><span class="quickedit hide-if-no-js"> | <a onclick="commentReply.open( ' + "'" + data['commentId'] + "','" + data["postId"] + "','edit'" + ' );return false;" class="vim-q" title="' + objectL10n.quickEdit + '" href="#">' + objectL10n.quickEdit + '</a></span><span class="edit"> | <a href="comment.php?action=editcomment&amp;c=' + data['commentId'] + '" title="' + objectL10n.editComment + '">' + objectL10n.edit + '</a></span><span class="spam"> | <a href="comment.php?c=' + data['commentId'] + '&amp;action=spamcomment&amp;' + data["commentWpNonceDel"] + '" class="delete:the-comment-list:comment-' + data['commentId'] + '::spam=1 vim-s vim-destructive" title="' + objectL10n.markThisCommentAsSpam + '">' + objectL10n.spam + '</a></span><span class="trash"> | <a href="comment.php?c=' + data['commentId'] + '&amp;action=trashcomment&amp;' + data["commentWpNonceDel"] + '" class="delete:the-comment-list:comment-' + data['commentId'] + '::trash=1 delete vim-d vim-destructive" title="' + objectL10n.moveThisCommentToTheTrash + '">' + objectL10n.trash + '</a></span></div></div></div></td></tr>';
         
              return commentTmplHTML;
            }

            /**
             * Returns array of parents.
             * Parents make sense only if the comment is in the list of comments,
             * and that's why we don't care when it's not;
             * @return array of parents
             */
            this.parents = function(){
                    /**
                     * We take the first element with expected depth, until 
                     * there is nothing to take.
                     */
                    if( $this.getData( "commentDepth" ) > 1 ){
                        var expectedDepth = $this.getData( "commentDepth" ) - 1;
                        var p = $dom["list"].prevUntil( "tr.depth-1","tr:not(.wptc-special-drop)" ).map( function( index, comment ){
                            if( $( comment ).data( 'wptcCommentObject' ).getData( "commentDepth" ) == expectedDepth ) {
                                expectedDepth--;
                                return $( comment ).data( 'wptcCommentObject' );
                            }
                        });

                        //Add the comment with depth equals to 1
                        if( p.length > 0 ){
                            p.push( $( "#comment-" + p[p.length - 1].getData( 'commentId' ) ).prev( "tr:not(.wptc-special-drop)" ).data( 'wptcCommentObject' ) );
                        } else if( $this.getData( 'commentDepth' ) > 1 ){
                            var parent = $dom['list'].prevAll( "tr:not(.wptc-special-drop)" ).first().data( 'wptcCommentObject' );
                            if( parent ){ 
                                p.push( parent );
                            }
                        }                    

                        properties["parents"] = p;
                    // If the comment is a root level one, it has no parents
                    } else {
                        properties["parents"] = [];
                    }

                return properties["parents"];
            }
               
            /**
             * Expands a subthread of this comment.
             * @return this comment objects
             */         
            this.expandSubthread = function(){
                var toExpand = $this.subthread();
                
                var expanded = 0;               
                var levelExpansion = 0;
                
                //Change the link
                $dom["list"].find( 'a.tc-show-more' ).attr( 'class','tc-show-less' ).text( objectL10n.collapse );
                
                /**
                 * Expand comments, level after level, until there is nothing 
                 * left, or required minimum has been met.
                 */
                while( expanded < $this.getData( "commentNoc" ) && ( expanded < wptcO.expandingMinimum || levelExpansion < toExpand.length ) ){
                    toExpand[levelExpansion].jq().show().addClass( "wptc-expanded" ).find( 'a.tc-show-more' ).attr( 'class','tc-show-less' ).text( objectL10n.collapse );
                    expanded++;
                    levelExpansion++;
                    
                    if( levelExpansion == toExpand.length && expanded < wptcO.expandingMinimum ){
                        levelExpansion = 0;
                        var toExpandTmp = toExpand;
                        toExpand = [];
                        
                        $.each( toExpandTmp, function( index, el ){
                            var elExpand = el.subthread();
                            $.each( elExpand, function( indexindex, elel ){
                                toExpand.push( elel );
                            })
                        });
                        
                    }
                }
                return this;        
            } 
            
             /**
             * Collapses a subthread of this comment.
             * @return this comment objects
             */     
            this.collapseSubthread = function(){
                $dom["list"].find( 'a.tc-show-less' ).attr( 'class','tc-show-more' ).text( objectL10n.expand );
                $.each($this.children(), function( index, el ){
                    el.jq().hide().removeClass( "wptc-expanded" ).find( 'a.tc-show-less' ).attr( 'class','tc-show-more' ).text( objectL10n.expand );
                });
                return this;
            }
            

            /**
             * Returns array of comments filtered by depth of its objects.
             * @param commentsArray array of comment objects
             * @param level         depth of every comment in returned array
             * @return commentsArray filtered by the depth of comment
             */
            function filterLevel( commentsArray, level ){
                return $.map( commentsArray, function( obj ){
                    if(obj.getData( "commentDepth" ) == level) return obj;            
                });        
            }

            /**
             * Returns array of direct replies to the comment.
             * @return direct replies to this comment
             */
            this.subthread = function(){
                return filterLevel( $this.children(), parseInt(data["commentDepth"]) + 1 );
            }

            /**
             * Accessor for HTML code of this comment
             * @param type  dropzone | list - type of code to be returned
             * @return HTML code
             */
            this.jq = function( type ){
                if( ! type ){
                    type = "list";            
                }            
                return $dom[type];        
            } 

            /**
             * Checks if a comment with the given id exists to the same tread
             * as this comment.
             * @param commentId id of the comment we want to check agains
             * @param where     children | parents - where to look for a comment          
             * @return bool depending whether a comment with the given id 
             *              belongs to ths comment's children or parents
             */
            function isIn( commentId, where ){ //children / parents
                var is = false;
                var array = [];
                if( where === "parents" ){
                    array = parents();
                } else {
                    array = $this.children();
                }

                $.each( array, function( index, comment ){
                    if( comment.getData( "commentId" ) == commentId ){
                        is = true;
                        return false;                    
                    }                
                });

                return is;
            }
        }

        function WPTCHistory( wptcO ){
            var past = [];
            var future = [];

            var redoButton = $( "#" + settings.historyButtonsId + "-redo" ).click( function( e ){ 
                e.preventDefault(); 
                redo();
                return false;
            });

            var undoButton = $( "#" + settings.historyButtonsId + "-undo" ).click( function( e ){ 
                e.preventDefault(); 
                undo();
                return false;
            });

            /**
             * Stores the history of events in session storage.
             */
            function store(){
                 amplify.store.sessionStorage( settings.historyStorageItemsName + "-past", past );
                 amplify.store.sessionStorage( settings.historyStorageItemsName + "-future", future );
            }
            
            /**
             * Restores the history of events from session storage.
             */
            this.restore = function(){
                var _past    = amplify.store.sessionStorage( settings.historyStorageItemsName + "-past" );
                if( _past ){
                    past = _past;                
                }                
                var _future  = amplify.store.sessionStorage( settings.historyStorageItemsName + "-future" );
                if( _future ){
                    future = _future;                
                } 
                edButtons();
                wptcO.wptcDropzone.showhide();
            }

            /**
             * Adds event to the history.
             * @param data  data to be inserted
             */
            this.put = function( data ){
                 past.push({
                     "commentId" : data["commentId"], 
                     "oldParentId" : data["newParentId"],
                     "oldPostId" : data["newPostId"],
                     "newParentId" : data["oldParentId"],
                     "newPostId" : data["oldPostId"],
                     "commentWpNonceMove" : action["commentWpNonceMove"],
                });
                future = [];
                store();
                edButtons();
                wptcO.wptcDropzone.showhide();
            }

            /**
             * Returns selected events.
             * @param type  future | past from where events are selected
             * @param n     how many event to return
             * @return n events from selected history
             */
            function get(type, n){
                if( !type || type.toLowerCase() == "past" ){
                    if( !n ) return past;
                    else return past.slice( 0, n )
                } else {            
                    if( !n ) return future;
                    else return future.slice( 0, n )       
                }        
            }

            /**
             * Controls the state of `undo` and `redo` buttons according to the
             * state of the past and the future.
             */
            function edButtons(){
                if( !future.length ) redoButton.attr( "disabled", "disabled" );
                else redoButton.removeAttr( "disabled" );
                if( !past.length ) undoButton.attr( "disabled", "disabled" );
                else undoButton.removeAttr( "disabled" );
            }
        
            /**
             * Undoes previous action.
             */
            function undo(){
                var action = past.pop();
                execute( action );
                future.push( {
                     "commentId" : action["commentId"], 
                     "oldParentId" : action["newParentId"],
                     "oldPostId" : action["newPostId"],
                     "newParentId" : action["oldParentId"],
                     "newPostId" : action["oldPostId"],
                     "commentWpNonceMove" : action["commentWpNonceMove"],
                } );
                store();
                edButtons();
                wptcO.wptcDropzone.showhide();
            }

            /**
             * Redoes previousky undone action.
             */
            function redo(){
                var action = future.pop();
                execute( action );
                past.push( {
                    "commentId" : action["commentId"], 
                    "oldParentId" : action["newParentId"],
                    "oldPostId" : action["newPostId"],
                    "newParentId" : action["oldParentId"],
                    "newPostId" : action["oldPostId"],
                    "commentWpNonceMove" : action["commentWpNonceMove"],
                } );
                store();               
                edButtons();
                wptcO.wptcDropzone.showhide();       
            }

            /**
             * Executes an action
             * @param action array :
             *      - commentId
             *      - newParentId
             *      - newPostId
             *      - oldParentId
             *      - oldPostId 
             */
            function execute( action ){
                //First try to find both comment and a nwe parent in the DOM
                var comment = $( "#comment-" + action["commentId"] );
                var parent = $( "#comment-" + action["newParentId"] );
                
                //Execute action
                ajaxMove( action["commentId"], action["newParentId"], action["newPostId"], action["commentWpNonceMove"] );                

                /**
                 * Both new parent and a comment exists in the DOM.
                 * All we have to do is to move one to another, and perform 
                 * some minor helping/cleaning actions.
                 */
                if( comment.length && parent.length ){ 
                    comment.wptc().moveTo( parent.wptc() );
                    wptcO.wptcDropzone.notify( objectL10n.commentWithId + " " + action["commentId"] + " " + objectL10n.hbReparented );
                    past.pop(); //remove action added by moveTo
                
                /**
                 * Only the comment exists in the DOM, but it is supposed to be
                 * rooted, so again there's almost nothing to do.
                 */
                } else if(comment.length && parseInt( action["newPostId"] ) == parseInt( action["oldPostId"] ) && parseInt( action["newParentId"] ) == 0){ //root it
                    comment.wptc().moveTo( null, "root" );
                    wptcO.wptcDropzone.notify( objectL10n.commentWithId + " " + action["commentId"] + " " + objectL10n.hbMovedToRoot);
                    past.pop(); //remove action added by moveTo
                /**
                 * Only the new parent exists in the DOM, we have to create 
                 * the comment and move it to the new parent.
                 */
                } else if ( parent.length ){ 
                    var c = new WPTCComment( action["commentId"], wptcO, function( coo, html ){
                        coo.moveTo( parent.wptc() );
                        wptcO.wptcDropzone.notify( objectL10n.commentWithId + " " + action["commentId"] + " " + objectL10n.hbReparented );
                        past.pop(); //remove action added by moveTo
                    });
                /**
                 * Only comment exists. We have to hide the comment, 
                 * its subthread, and fix priperties of their parents.
                 */
                } else if( comment.length ){
                    wptcO.wptcDropzone.notify( objectL10n.commentWithId + " " + action["commentId"] + " " + objectL10n.hbReparented );
                    comment.hide();
                    $.each( comment.wptc().children(), function( index, child ){
                        child.jq().remove();                    
                    });

                    var parents = comment.wptc().parents();
                    var nocMod =  comment.wptc().getData( "commentNoc" ) + 1;
                    $.each( parents, function( index, parent ){
                        parent.fixChildren( - nocMod );
                        parent.setProperty( 'children', null );                    
                    });              
                    comment.remove();
                } else { 
                /**
                 * Nothing exists, no problem, everything happens in 
                 * the background.
                 */
                    wptcO.wptcDropzone.notify( objectL10n.commentWithId + " " + action["commentId"] + " " + objectL10n.hbReparented);
                }
            }

            /**
             * Checks if the history is empty.
             * @return bool whether both future and past are empty
             */
            this.empty = function(){
                return ( !past.length && !future.length );
            }

            /**
             * Clear the history
             */
            function clear(){
                past = [];
                future = [];
                store();
                wptcO.wptcDropzone.showhide();
            }
        }

        /**
         * Class responsible for handling the dropzone.
         * @param wptcO     instance of the plugin
         */
        function WPTCDropzone( wptcO ){
            var $this = $( this )[0];

            var items = []; //stores Comments
            var $dom = [];        

            /**
             * Restores dropzone from the browser's memory.       
             */
            this.restore = function(){
                var itemsIds = amplify.store( settings.dropzoneStorageItemsName );
                if( ! itemsIds ) return true;                
                items = $.map( itemsIds, function( commentId ){
                  var $comment = $( "#comment-" + commentId );

                  if( $comment.length && $comment.wptc() ){
                        $this.put( $comment.wptc() );                        
                        return $comment.wptc();
                    } else {
                        return new WPTCComment( commentId, wptcO, function( comment ){
                            comment.setProperty( "status", "dropzone" );
                            $this.put( comment );                        
                        });          
                    }                
                });
                $this.showhide();
            }       

            /**
             * Object's constructor.   
             * @return this object    
             */
            function construct(){

                    /**
                     * Generate html code and insert to the right place.
                     */
                    if( !$dom.length ) $dom = $(HTML()).insertAfter( "#posts-filter .search-box" ).hide();
                    if( !$dom.length ) $dom = $(HTML()).insertAfter( "#comments-form .search-box" ).hide();

                    //Makes the dropzone droppable
                    $dom.droppable({
                      scope : "wptc-comments",
                      drop: function(event, ui){
                            ui.draggable.wptc().dropTo( null, "dropzone" );
                            $dom.removeClass( settings.dropOverClass );
                      },
                      over: function(){
                            $dom.addClass( settings.dropOverClass );
                      },
                      out: function(){
                            $dom.removeClass( settings.dropOverClass );
                      },
                    });

                    /**
                     * Check-all checkbox functionality.
                     */
                     $( "#wptc-dropzone input[name='wptc-dropzone-all']" ).click( function(){
                        if( $( this ).is( ':checked' ) ) {
                            $( "#wptc-dropzone input:checkbox" ).attr( 'checked' , true );
                        } else {
                            $( "#wptc-dropzone input:checkbox" ).attr( 'checked', false );
                        }
                    });

                    $( "#wptc-dropzone input:checkbox:not([name='wptc-dropzone-all'])" ).live( 'click' , function(){
                        $( "#wptc-dropzone input[name='wptc-dropzone-all']" ).attr( 'checked', false );
                    })
                 return this;
            }


            /**
             * Generates HTML code for the dropzone.
             * @return HTML code
             */
            function HTML(){ 
                return "<div id='" + settings.dropzoneId + "' class='droppable'><ul><li class='wptc-dropzone-header'><span class='comment-cb'><input type='checkbox' name='wptc-dropzone-all' val='all'/></span><span class='wptc-dropzone-title'>" + objectL10n.dropzone + "</span><span class='wptc-history-actions'><button class='button-secondary' id='wptc-history-undo'>" + objectL10n.undo + "</button><button class='button-secondary' id='wptc-history-redo'>" + objectL10n.redo + "</button></span></li><li class='wptc-history-notifications'></li></ul></div>";
            }

            /**
             * Displays simple notification.
             * @param text text of a notification
             */
            this.notify = function(text){
                var $notification = $( "<span />" ).appendTo( $dom.find( ".wptc-history-notifications" ).show() );
                $notification.text( text );
                $notification.delay( 1000 ).fadeOut( 2000, function(){ 
                    $notification.remove();
                    $dom.find( ".wptc-history-notifications" ).hide();
                } );
            }

            /**
             * Stores dropzone in browser"s storage.
             */
            var store = function(){
                itemsIds = $.map( items, function( comment ){
                    return comment.getData( "commentId" );
                } );
                amplify.store( settings.dropzoneStorageItemsName, itemsIds );
            }

            
            /**
             * Checks if the dropzone is empty.
             * @return bool whether the dropzone is empty
             */
            this.empty = function(){
                return items.length == 0;
            }

            /**
             * Comment is dropped to the dropzone.
             * @param comment commment object
             */
            this.drop = function( comment ){
                $this.put( comment );
            }
            /**
             * Comment is dragged out of the dropzone (and dropped somewhere else).
             * @param comment object - comment which is dragged out
             */
            this.drag = function( comment ){
                remove( comment );
                comment.jq().removeClass( settings.inDropzoneClass );
            }

            /**
             * Comment is removed from the dropzone.
             * @param comment comment to be removed
             */
            this.remove = function( comment ){
                commentId = comment.getData("commentId");
                items = $.map(items, function(obj){ 
                    if(obj.getData( "commentId") != commentId) 
                        return obj;
                });
                $dom.find( ".dropzone-comment-" + commentId).detach(); //remove Commment           
                comment.jq().removeClass( settings.inDropzoneClass );
                comment.jq().draggable( "option", "disabled", false );
                comment.setProperty( "status", "list" );            
                $.each(comment.children(),function( index, child ){
                    child.jq().removeClass( settings.inDropzoneClass );
                    child.jq().draggable( "option", "disabled", false );
                    child.setProperty( "status", "list" );   
                });            
                store();
                $this.showhide();            
            }

            /**
             * Comment is added to the dropzone.
             * @param comment comment to be added       
             */
            this.put = function( comment ){

                if(!$this.isIn( comment ) ){
                    items.push( comment );
                }
                $dom.find( "ul" ).append( comment.jq( "dropzone" ) );
                comment.jq().addClass( settings.inDropzoneClass );
                comment.jq().draggable( "option", "disabled", true );
                comment.setProperty( "status", "dropzone" );
                $.each( comment.children(),function( index, child ){
                    child.jq().addClass( settings.inDropzoneClass );
                    child.jq().draggable( "option", "disabled", true );
                    child.setProperty( "status", "dropzone" );
                });
                store();
                $this.showhide();
            }
            
            this.isIn = function( comment ){
                var commentId = comment.getData( "commentId" );                
                for( var i = 0; i < items.length; i++ ){
                    if( commentId == items[i].getData( "commentId" ) ){
                        return true;                    
                    }
                }
                return false;
            }

            /**
             * Show or hide dropzone depending on the current situation.
             */
            this.showhide = function(){
                if( $this.empty() && wptcO.wptcHistory.empty() ){
                    $dom.hide();
                } else {
                    $dom.show();
                }
            }

            /**
             * Clear dropzone.
             */
            this.clear = function(){
                items = [];
                $dom.find( "li.comment" ).remove();
                $( "#the-comment-list tr" ).removeClass( settings.inDropzoneClass );
                store();            
                showhide();        
            }
            
            /**
             * Generates html code for a dropzone's element.
             * @param commentObj    comment for which a dropzone element is 
             *                      generated
             * @return HTML code of the element
             */
            this.generateHTML = function( commentObj ){
                var comment = commentObj.getData();
                var dots = ( comment['commentText'].length > settings.numberOfCharactersShown ) ? "…" : '';                
                return commentHTML = "<li class='draggable dropzone-comment-" + comment['commentId'] + "'><span class='comment-cb'><input type='checkbox' name='tc-move-comments[]' value='" + comment['commentId'] + "'></span><span class='comment-author'>" + comment['commentAuthor'] + "</span><span class='comment-text'>" + comment['commentText'].substr( 0, settings.numberOfCharactersShown ) + dots + "</span><span class='comment-time'>" + comment['commentDateFormatted'] + "</span></li>";
            }

            construct();
        }

        /**
         * Handles bulk actions.
         * @param e event object
         */
        function bulk( e ){
          var bulkCommand = $( this ).prev().val();
          if( bulkCommand.substr( 0, 2 ) == "tc" ){
               e.preventDefault(); 
               if( bulkCommand == settings.bulkRmFromToDropzone ){
                    $( "#wptc-dropzone input:checkbox:checked:not([name='wptc-dropzone-all'])" ).each(function(){                
                        $this.wptcDropzone.remove( $( this ).closest( "li" ).wptc() );
                    });
                    $( "#the-comment-list input:checkbox:checked" ).each( function(){
                        $this.wptcDropzone.remove( $( this ).closest( "tr" ).wptc() );
                    });
                    $this.wptcDropzone.showhide();
               } else if( bulkCommand == settings.bulkMvToDropzone ){
                    $( "#the-comment-list input:checkbox:checked" ).each(function(){
                        var id = $( this ).attr( 'checked', false ).val();
                         
                        $this.wptcDropzone.put( $( "#comment-" + id ).wptc() );
                    });
                    $this.wptcDropzone.showhide();
               } else if( bulkCommand == settings.bulkMvTo ){

                        var targetId =  $( "#the-comment-list input:checkbox:checked" ).val();
                        var target = $( "#comment-" + targetId ).wptc();
                        
                        $( "#wptc-dropzone input:checkbox:checked:not([name='wptc-dropzone-all'])" ).each(function(){
                            $( this ).closest( "li" ).wptc().moveTo(target);
                        });  
                      
               } else if( bulkCommand == settings.bulkMvToRoot ){

                    $( "#wptc-dropzone input:checkbox:checked:not([name='wptc-dropzone-all'])" ).each(function(){                
                        $( this ).closest( "li" ).wptc().moveTo( null, "root" );
                    });
                    $( "#the-comment-list input:checkbox:checked" ).each( function(){
                        $( this ).closest( "tr" ).wptc().moveTo( null, "root" );
                    });
                    $this.wptcDropzone.showhide(); 
                      
               }
              $( "#wptc-dropzone input, #the-comment-list input" ).attr( 'checked', false );
                
              return false;
          }
        }
        
        $( 'select[name="action"]' ).next().click( bulk );       

        /**
         * Changes comment counter for a post.
         * @param oldPostId id of the previous parent
         * @param newPostId id of the new parent
         * @param mod       how should we modify the comment count
         */
        function fixCommentsCounters( oldPostId, newPostId, mod ){
            //Fix old post            
            var $cc = $( "#post-" + oldPostId ).find( ".comment-count" );
            var currentNoc = parseInt( $cc.text() );
            $cc.text( currentNoc - mod );

            //Fix new post
            $cc = $( "#post-" + newPostId ).find( ".comment-count" );
            currentNoc = parseInt( $cc.text() );
            $cc.text( currentNoc + mod );

            //Fix comment counter for every comment 
            $( "#the-comment-list tr:not(.wptc-special-drop)" ).each( function(){
                var thisPostComCount = $( this ).find( ".post-com-count" );
                if( thisPostComCount.length ){
                    var thisPostId = $( this ).wptc().getData( "postId" );
                    if( thisPostId == oldPostId ){
                        var $cc = thisPostComCount.find( ".comment-count" );
                        var currentNoc = parseInt( $cc.text() );
                        $cc.text( currentNoc - mod );
                    } else if( thisPostId == newPostId ){
                        var $cc = thisPostComCount.find( ".comment-count" );
                        var currentNoc = parseInt( $cc.text() );
                        $cc.text( currentNoc + mod );
                    }
                }
            });
        }
        
        /**
         * Retrieves data of a comment's thread from the server.
         * @param userData          parameters for server
         *          - c             id of a comment
         *          - cs            multiple ids
         *          - single        should server return whole thread or only
         *                          the comment
         * @param userParameters    parameters for jQuery ajax call
         * @param dontGet           should we bother sending the request
         * @return defferrable object which returns data of comments
         */
        function ajaxGetThread( userData, userParameters, dontGet ){
            if( dontGet ){
                return true;
            }            

            var defaultData = {
                action: 'get-comment-subthread',
            };
            var data = $.extend( {}, defaultData, userData );


            var defaultParameters = {
                type: "GET",
                dataType: "JSON",
                url: ajaxurl,
                data: data,
                dataFilter: function(data) {
                    return data; 
                },
                timeout: 20000,
                cache: false,
            };
            var parameters = $.extend( {}, defaultParameters, userParameters );
            
            return $.ajax( parameters );
        }
       
        /**
         * Actually moves a comment.
         * @param commentId         comment's id
         * @param parentId          comment's new parent's id
         * @param postId            comment's new post's id
         * @param userParameters    parameters for jQuery ajax call
         * @return defferrable object
         */
        function ajaxMove(commentId, parentId, postId, wpnonce, userParameters){
            var data = {
			    action: 'move-comment',
			    single: 'false',
                postid: postId,
			    c: commentId,
                parent: parentId,
                _wpnonce: wpnonce,
                returncommentsubthread: 'false',
		    };

          var defaultParameters = {
                type: "GET",
                dataType: "JSON",
                url: ajaxurl,
                data: data,
                dataFilter: function(data) {
                    return data; 
                },
                timeout: 20000,
                cache: false,
            };
            
            var parameters = $.extend({}, defaultParameters, userParameters);
            
            return $.ajax(parameters);
        }

	    function editCommentWidget(){
		    $( "#move-to" ).suggest( ajaxurl + '?action=search-post-by-title&tax=move-to', { delay: 500, minchars: 2, multiple: true, multipleSep: " | " } );
		    var widgetPostId = $( "input[name='comment_post_ID']" ).val();
		    var widgetCommentId = $( "input[name='comment_ID']" ).val();

            //TODO find a way to simply compute page's number - required for inspection
		    /*$( "<a />" ).attr( { 
			    "id"	: "wptc-inspect-button",
			    "class" : "button",
			    "href"	: "wp-tc-edit-comments.php?p=" + widgetPostId + "&paged=" + widgetCommentPage +  "#comment-" + widgetCommentId, 
		    } ).text( "Inspect" ).insertBefore( "#move" );*/

		    var inspected = window.location.hash.search(/#comment-/i) + 9; 

            if( inspected == 8 ) return; // -1 + 9
            
		    inspected = parseInt( window.location.hash.substr( inspected ) );
            
            if( !inspected ) return;

		    var $inspected = $( "#comment-" + inspected ).addClass( "wptc-inspected" );
            var wptcInspected = $inspected.wptc();

            var children = wptcInspected.children();
            for( var i = 0; i < children.length; i++ ){
                children[i].jq().addClass( "wptc-inspected-thread" );        
            }

            var parents = wptcInspected.parents();
            var i = 0;
            while( i < parents.length ){               
                parents[i].expandSubthread();
                i++;
            }
            wptcInspected.expandSubthread();
	    }

        function onScreenOptions(){
            this.expandingMinimum = parseInt( $( '#wptc-min-expand-setting' ).val() );

	        $( '#wptc-min-expand-setting' ).change( function(){
                this.expandingMinimum = parseInt( $( this ).val() );

                var params = $( this ).serialize();
		        params = params + '&action=save_settings-wptc';
		        
                $.post(
			        ajaxurl,
			        params
		        );
            });
        }

    }
})( jQuery );

(function( $ ){
    jQuery( document ).ready( function(){
    /**
     * By default after dropping, comment is no longer dragable, because jQuery
     * UI calls a destructor on it. This is the easiest and the most effective
     * method of overcoming that.
     */
    jQuery.ui.draggable.prototype.destroy = function( ul, item ) { };
    jQuery.ui.droppable.prototype.destroy = function( ul, item ) { };
    wptcObject = jQuery.wptc();

    //Modified commentReply to handle comments created this way
    commentReply.show = function(xml) {
		var t = this, r, c, id, bg, pid;

		t.revert();

		if ( typeof(xml) == 'string' ) {
			t.error({'responseText': xml});
			return false;
		}

		r = wpAjax.parseAjaxResponse(xml);
		if ( r.errors ) {
			t.error({'responseText': wpAjax.broken});
			return false;
		}

		r = r.responses[0];
		c = r.data;
		id = '#comment-' + r.id;
		if ( 'edit-comment' == t.act )
			$(id).remove();

		if ( r.supplemental.parent_approved ) {
			pid = $('#comment-' + r.supplemental.parent_approved);
			updatePending( getCount( $('span.pending-count').eq(0) ) - 1 );

			if ( this.comments_listing == 'moderated' ) {
				pid.animate( { 'backgroundColor':'#CCEEBB' }, 400, function(){
					pid.fadeOut();
				});
				return;
			}
		}

		$(c).hide()
		$('#replyrow').after(c);
        
        $( c ).wptc();

		id = $(id);
		t.addEvents(id);
		bg = id.hasClass('unapproved') ? '#FFFFE0' : id.closest('.widefat').css('backgroundColor');

		id.animate( { 'backgroundColor':'#CCEEBB' }, 300 )
			.animate( { 'backgroundColor': bg }, 300, function() {
				if ( pid && pid.length ) {
					pid.animate( { 'backgroundColor':'#CCEEBB' }, 300 )
						.animate( { 'backgroundColor': bg }, 300 )
						.removeClass('unapproved').addClass('approved')
						.find('div.comment_status').html('1');
				}
			});
};
} )})( jQuery );



