<?php
/**
 * Functions used by the plugin.
 *
 * @package ThreadedComments
 */

require_once( ABSPATH . 'wp-admin/includes/class-wp-list-table.php' );
require_once (ABSPATH . 'wp-admin/includes/class-wp-comments-list-table.php' );
require_once( 'class-wp-tc-comments-list-table.php' );
require_once( "wp-tc-ajax.php" );

/**
 * Redirects to wp-tc-edit-comments.php if threaded comments are active, and
 * if required symlinks have been created.
 */
function tc_redirect_to_threaded_view(){
	if( absint( get_option( 'thread_comments' ) ) == 1 && tc_check_symlinks() ){
		wp_redirect( 'wp-tc-edit-comments.php?' . http_build_query( $_REQUEST ) );
	}
}

/**
 * Adds style for custom html elements.
 */
function tc_styles(){
	$admin_handle = 'tc_css';
	$admin_stylesheet = plugins_url( 'tc.css' , __FILE__ );
	wp_enqueue_style( $admin_handle, $admin_stylesheet );
}
/**
 * Internationalization
 */
function tc_init(){
    load_plugin_textdomain('wptc', false, basename( dirname( __FILE__ ) ) . '/translations' );
}

/**
 * Enqueues required js scripts and adds a widget to the Edit Comment page.
 */
function tc_js(){
          
    wp_register_script( 'amplify', plugins_url( 'js/amplify/amplify.min.js' , __FILE__ ), array( 'jquery' ) );
    wp_register_script( 'tc_js', plugins_url( 'js/jquery.wptc.js' , __FILE__ ), array( 
        'jquery', 
        'suggest', 
        'amplify', 
        'jquery-ui-core', 
        'jquery-ui-draggable', 
        'jquery-ui-droppable',
    ) );
    wp_enqueue_script( 'tc_js' );
    wp_localize_script( 'tc_js', 'objectL10n', array(
        'approve' =>                    __( "Approve", "wptc" ),
        'approveThisComment' =>         __( "Approve this comment", "wptc" ),
        'collapse' =>                   __( "Collapse", "wptc" ),
        'commentWithId' =>              __( "Comment with id:", "wptc" ),    
	    'dropzone' =>                   __( "Dropzone", "wptc" ),
        'edit' =>                       __( "Edit", "wptc" ),
        'editComment' =>                __( "Edit comment", "wptc" ),
        'expand' =>                     __( "Expand", "wptc" ),
        'has' =>                        __( "Has", "wptc" ),
        'hbMovedToRoot' =>              __( "has been moved to the root level.", "wptc" ),
        'hbReparented' =>               __( "has been reparented.", "wptc" ),
        'inReplyTo' =>                  __( "In reply to", "wptc" ),
        'inspect' =>                    __( "Inspect", "wptc" ),
        'markThisCommentAsSpam' =>      __( "Mark this comment as spam", "wptc" ),
        'moveThisCommentToTheTrash' =>  __( "Move this comment to the trash", "wptc" ),
        'pReplies' =>                   __( "replies", "wptc" ),
        'quickEdit' =>                  __( "Quick&nbsp;Edit", "wptc" ),
        'redo' =>                       __( "Redo", "wptc" ),
        'reply' =>                      __( "Reply", "wptc" ),
        'replyToThisComment' =>         __( "Reply to this comment", "wptc" ),
	    'rootTheComment' =>             __( "Root the comment", "wptc" ),
        'rootURL' =>                    get_option('home'),
	    'spam' =>                       __( "Spam", "wptc" ),
        'sReplies' =>                   __( "reply", "wptc" ),
        'submittedOn' =>                __( "Submitted on", "wptc" ),
        'trash' =>                      __( "Trash", "wptc" ),
        'undo' =>                       __( "Undo", "wptc" ),
        'unapprove' =>                  __( "Unapprove", "wptc" ),
        'unapproveThisComment' =>       __( "Unapprove this comment", "wptc" ),

    ) );

	if( absint( get_option( 'thread_comments' ) ) == 1 ){
		add_meta_box( 
            'move_reparent', 
            __( 'Move comment' ),
            'tc_move_reparent_widget',
            'comment', 'normal', 'core'
        );
    }
}

/**
 * Disables sorting author column in wp-tc-edit-comments.
 * @param $columns columns which are sortable
 * @return sortable columns
 */
function tc_deregister_sortable( $columns ){
	unset ( $columns['author'] );
	return $columns;
}

/**
 * Returns an array of posts/pages which title matches anyhow given string.
 * @param $title    a string to match against
 * @return array of posts/pages
 */
function tc_get_posts_by_title( $title ){
	global $wpdb;
	
	$query = "
	    SELECT P.ID, P.post_title
	    FROM {$wpdb->prefix}posts as P
	    WHERE
	    ( P.post_type = 'post'
	    OR P.post_type = 'page' )
	    AND P.post_status = 'publish'
	    AND P.post_title LIKE '%{$title}%'
	    ORDER BY P.post_date
	    DESC;
	";
	
 	$posts = $wpdb -> get_results( $query, ARRAY_A );
	return $posts;
}

/**
 * Creates move widget in a Edit Comment screen.
 */
function tc_move_reparent_widget(){
	$comment_id = absint( $_GET['c'] );
	$comment = get_comment( $comment_id );

    ?>
	<div id='move-reparent-box' style='overflow:hidden;'>
		<div id="major-actions">
        
		<form id='move-by-title' action='wp-tc-ajax.php' method='get'>
		<input type="text" id="move-to" name="move-to" size="16" value="" tabindex="6"/>
        <?php wp_nonce_field( "tc-move-comment_$comment_id" ) ?>
		<input type="submit" name="move" id="move" class="button-primary" value="<?php _e( "Move", "wptc" ); ?>" tabindex="4">
		</form>
		<div class="clear"></div>
		</div>
	</div>
    <?php
}

/**
 * Returns an array of comments according to given arguments
 * @param $args arguments
 * @return an array of comments' objects
 */
function tc_comments_get( $args ){
    $walker = new Walker_Comment_Threaded() ;
    $defaults = array( 
        'max_depth' => '10', 
        'post_id' => '', 
        'single' => 'false', 
        'comment_ID' => '0', 
        'page' => '1', 
        'per_page' => get_option( 'default_post_edit_rows' ), 
        'offset' => '-1', 
        'subthread' => 'false'
    );
  
    $args = wp_parse_args( $args, $defaults );
    if( ! $args['post_id'] ){ 
          $args['post_id'] = get_comment( $args['comment_ID'] );
          $post_ID = get_comment( $args['comment_ID'] );
          $args['post_id'] = $post_ID -> comment_post_ID;    
    }

     if( absint( $args['offset'] ) != -1 ){
          $comments = $walker -> paged_walk( 
            get_comments( 'post_id=' . $args['post_id'] ), 
            $args['max_depth'], 
            $args['offset'] / $args['per_page'] + 1, 
            $args['per_page'], 
            $args 
          );
     } else {
          $comments = $walker -> walk( get_comments( 'post_id='.$args['post_id'] ), $args['max_depth'], $args );
     }
	$comments = json_decode( $comments );
    if( ! is_array( $args['comment_ID'] ) ){
        $args['comment_ID'] = array( $args['comment_ID'] );
    }
    
    if( ! is_array( $args['single'] ) ){
        $args['single'] = array( $args['single'] );
    }


    
    $valid_comments = $comments;
     
    if( $args['subthread'] == 'true' ){
         $valid_comments = array();
         
         foreach( $comments as $comment ){
             $comment = tc_filter( $comment, $args['comment_ID'], $args['single'] );
             if( $comment ){
                 $valid_comments[] = $comment;
             }
         }
         
         while( count( $valid_comments ) === 1 && is_array( $valid_comments ) ){
             $valid_comments = $valid_comments[0];
         }
         
          if( ! is_array( $valid_comments ) ) $valid_comments = array( $valid_comments );
    }

    return $valid_comments;
}

/**
 * Flattens an array of comment's objects into a single dimensional 
 * array of objects, without nested objects. 
 * @param $array            array of comments
 * @param $numberOfChildren number of children of current comment
 * @return an array of comments' objects
 */
function tc_comments_flatten( $array, &$numberOfChildren = 0 ) {
  if ( ! is_array( $array ) ) { 
    return FALSE; 
  } else if( isset( $array['comment_ID'] ) ) {
  	return $array;
  }
  
  $result = array(); 
  foreach( $array as $arr ){
  	$nOC = 0;
  	$arr = object2array( $arr );
  	if( isset( $arr['comment_children'] ) ){
  		$children = $arr['comment_children'];
  		unset( $arr['comment_children'] );
 
		$children = tc_comments_flatten( $children, $nOC );
  		$obj = array2object( $arr );
  		$obj -> number_of_children = $nOC;
  		$result[] = $obj;
  		foreach( $children as $child ){
  			$result[] = $child;
  		}
  	} else {
  		$obj = array2object( $arr );
  		$obj -> number_of_children = $nOC;
  		$result[] = $obj;
  	}
  	$numberOfChildren += ( 1 + $nOC );
  }
  return $result; 
} 


function tc_filter( $comment, $comment_ID, $single ){
    $key = array_search( $comment -> comment_ID, $comment_ID );
    
    if( $key === false ){
        $valid_children = array();
        if( isset( $comment -> comment_children ) ){
            foreach( $comment -> comment_children as $child ){
                $child = tc_filter( $child, $comment_ID, $single );
                if( $child ){
                    $valid_children[] = $child;
                }
            }
            return $valid_children;
        }
    } else{
        if( strcasecmp( $single[$key], 'true' ) === 0 ){
            unset( $comment -> comment_children );
        }
        
        return $comment;    
    }
}

/**
 * Converts an array to an object.
 * @param $array array to be converted
 * @return object created from the array
 */
function array2object( $array ) {
 
    if ( is_array( $array) ) {
        $obj = new StdClass();
 
        foreach( $array as $key => $val ){
            $obj -> $key = $val;
        }
    } else { 
        $obj = $array; 
    }
 
    return $obj;
}

/**
 * Converts an object to an array.
 * @param $object object to be converted
 * @return array created from the object
 */
function object2array( $object ) {
    if ( is_object( $object ) ) {
        foreach ( $object as $key => $value ) {
            $array[$key] = $value;
        }
    } else {
        $array = $object;
    }
    return $array;
}

/**
 * Modified function update_comment, which accepts comment_parent 
 * and comment_post_ID as modifiable parameters.
 * @param $commenarr array of comment to be converted
 * @return result of wpdb query
 */
function tc_update_comment( $commentarr ) {
	global $wpdb;
	// First, get all of the original fields
	$comment = get_comment( $commentarr['comment_ID'], ARRAY_A );

	// Escape data pulled from DB.
	$comment = esc_sql( $comment );

	$old_status = $comment['comment_approved'];

	// Merge old and new fields with new fields overwriting old ones.
	$commentarr = array_merge( $comment, $commentarr );

	$commentarr = wp_filter_comment( $commentarr );

	// Now extract the merged array.
	extract( stripslashes_deep( $commentarr ), EXTR_SKIP );

	$comment_content = apply_filters( 'comment_save_pre', $comment_content );

	$comment_date_gmt = get_gmt_from_date( $comment_date );

	if ( !isset( $comment_approved ) )
		$comment_approved = 1;
	else if ( 'hold' == $comment_approved )
		$comment_approved = 0;
	else if ( 'approve' == $comment_approved )
		$comment_approved = 1;

	$data = compact( 
        'comment_content', 
        'comment_author', 
        'comment_author_email', 
        'comment_approved', 
        'comment_karma', 
        'comment_author_url', 
        'comment_date', 
        'comment_date_gmt', 
        'comment_post_ID', 
        'comment_parent' 
    );

	$rval = $wpdb -> update( $wpdb->comments, $data, compact( 'comment_ID' ) );

	clean_comment_cache( $comment_ID );
	wp_update_comment_count( $comment_post_ID );
	do_action( 'edit_comment', $comment_ID );
	$comment = get_comment( $comment_ID );
	wp_transition_comment_status( $comment -> comment_approved, $old_status, $comment );
	return $rval;
}

/**
 * Moves comments to new posts.
 * @param $comment_idarr    array of comments' ids
 * @param $comment_postarr  array of target posts' ids
 * @param $singlearr        determines whether a comment should be moved by 
                            itself without a whole subthread
 */
function tc_comment_move( $comment_idarr, $comment_postarr, $singlearr = null ){
    for( $i = 0; $i < count( $comment_idarr ); $i++ ){
        $comment_id = $comment_idarr[$i];
        $comment_post = $comment_postarr[$i]; //new post id
        $single = $singlearr[$i];
        if( ! $single){
            $single = 'false';
        }
        $comment = get_comment( $comment_id );
        $post_ID = $comment -> comment_post_ID; //old post id

        do_action( 'move_comment', $comment_id );

        // Abandon if we're trying to move the comment to the same post it's in         
        if( $comment_post == $post_ID ) continue;
        
        // New comment's data
        $comment_data_new = array(
          'comment_ID' => $comment_id,
          'comment_post_ID' => $comment_post,
          'comment_parent' => 0, //it will moved as a root level comment
        );
           
        // Get comment's subthread     
        $comment_thread = tc_comments_get( array(
                                  'post_id' => $post_ID, 
                                  'comment_ID' => $comment_id,
                                  'single' => 'false',
                                  'subthread' => 'true'
                                ) );
        $comment_thread = $comment_thread[0];

        // If it has any child, either move them along or fix their properties  
        if( isset( $comment_thread -> comment_children ) ){
            $comment_children =  tc_comments_flatten( $comment_thread -> comment_children );
            echo "<pre>";
            var_dump($comment_children);
            echo "</pre>";
            // Move them only if we're supposed to
            if( strcasecmp( $single, 'false' ) === 0 ){
                
                foreach( $comment_children as $child ){
                    $comment_child_id = $child -> comment_ID;
                    
                    do_action( 'move_comment', $comment_child_id );
                    
                    $comment_child_data_new = array(
                      'comment_ID' => $comment_child_id,
                      'comment_post_ID' => $comment_post,
                    );

                    tc_update_comment( $comment_child_data_new );
                    
                    do_action( 'moved_comment', $comment_child_id );
                }
            // Otherwise reparent children to the comment's parent
            } else {
 
               foreach( $comment_children as $child ){
                    $comment_child_id = $child -> comment_ID;
                    
                    do_action( 'reparent_comment', $comment_child_id );
                    
                    $comment_child_data_new = array(
                      'comment_ID' => $comment_child_id,
                      'comment_parent' => $comment_thread -> parent_ID,
                    );  
                    
                    tc_update_comment( $comment_child_data_new );
                    
                    do_action( 'reparented_comment', $comment_child_id );
                }
            }
        }
        
        tc_update_comment( $comment_data_new );
        
        do_action( 'moved_comment', $comment_id );
        
    }

    return true;
}

/**
 * Reparents comments, i.e. changes their parents.
 * @param $comment_idarr    array of comments' ids
 * @param $comment_postarr  array of target parents' ids
 * @param $singlearr        determines whether a comment should be moved by 
                            itself without a whole subthread
 */
function tc_comment_reparent( $comment_idarr, $comment_parentarr, $singlearr = null ){
    for( $i = 0; $i < count( $comment_idarr ); $i++ ){
        $comment_id = $comment_idarr[$i];
        $comment_parent = $comment_parentarr[$i];
        $single = $singlearr[$i];
        if( ! $single){
            $single = 'false';
        }
        $comment = get_comment($comment_id);
        $comment_old_parent = $comment -> comment_parent;
        $post_ID = $comment -> comment_post_ID;

        do_action( 'reparent_comment', $comment_id );

        if( $comment_old_parent == $comment_parent ) continue;
            
        $comment_data_new = array(
          'comment_ID' => $comment_id,
          'comment_parent' => $comment_parent,
        );

        /*
         * If the comment should be moved by itself, its immediate children,
         * are being reparented to the comment's old parent. 
         */        
        if( strcasecmp( $single, 'true' ) === 0 ){

            //Get immediate children
            $comment_thread = tc_comments_get( array(
                                      'post_id' => $post_ID, 
                                      'comment_ID' => $comment_id,
                                      'single' => 'false',
                                      'subthread' => 'true'
                                ) );
            $comment_thread = $comment_thread[0];

            if( isset( $comment_thread -> comment_children ) ){
                $comment_children =  $comment_thread -> comment_children;
                
                // Foreach of them change the parent
                foreach( $comment_children as $child ){
                    $comment_child_id = $child -> comment_ID;
                    
                    $comment_child_data_new = array(
                      'comment_ID' => $comment_child_id,
                      'comment_parent' => $comment_thread -> parent_ID,
                    );  
                    
                    tc_update_comment( $comment_child_data_new );
                }
            }
        }
        
        tc_update_comment( $comment_data_new );
        
        do_action( 'reparented_comment', $comment_id );
    }
    
    return true;
}

/**
 * Modifies on-screen settings.
 * @parent $current current settings
 * @param $screen   sccreen to which settings belong
 * @return modified code of settings
 */
function tc_screen_settings( $current, $screen ){
    $option_min_e = get_option( "wptc_min_expand" );
    $desired_screen = convert_to_screen( "wp-tc-edit-comments" );

    if( $screen -> id == $desired_screen -> id ){
            $current .= "<div id='wptc-on-screen-settings'>";
            $current .= __( "Min", "wptc" ) ;
            $current .= "<input type='text' class='screen-per-page' id='wptc-min-expand-setting' value='";
            $current .= $option_min_e;
            $current .= "' maxlength='3' name='wptc_min_expand'/>";
            $current .= __( "comments expanded", "wptc" );
            $current .= ".</div>";

    }

    return $current;
}

/**
 * Adds new lines of help to contextual help.
 * @param $contextual_help  current html code of contextual help
 * @param $screen_id        id of current screen
 * @param $screen           current screen
 * @return modified html code of contextual help
 */
function tc_contextual_help( $contextual_help, $screen_id, $screen ){
    $dropzone_help = __( "<p class='hide-if-no-js'><strong>Dropzone</strong></p>
        <p class='hide-if-no-js'>It is an intermediate storage, where you can place comments before deciding where to move them. It allows you to easily move comments between various posts and pages of comments.</p>
        <p class='hide-if-no-js'><strong>Undo / Redo</strong></p>
        <p class='hide-if-no-js'>You can move back and forth in the history, and undo accidental mistakes with moving comments. Bulk actions are treated as a chain of single actions, so by undoing, you are undoing only one of them, not all.</p>
    ", "wptc" );
    
    $moving_comments_help = __( "<p class='hide-if-no-js'><strong>Moving comments</strong></p>
        <p class='hide-if-no-js'> You can move comments by simpy dragging them around, and dropping them onto their new parents. There are two 'special areas', whish show up whenever you have started dragging a comment. One of them 'Rootzone' allows you to quickly root the comment, i.e. remove it from a current tree, and treat it as a reply to a post or page. Another one 'Dropzone' allows you to move comments to the Dropzone, without having to move them all the way up, where the Dropzone is. You can also drag comments from the Dropzone, what makes possible to move comments between posts and pages.</p> 
        <p>All actions are performed on thread, so when you're moving a comment, you're moving it along with all its children.</p>   
    ", "wptc" );
    
    $threaded_comments_help = __( "<p><strong>Threaded comments</strong></p>
        <p> In 'Threaded view', if you're previewing comments for a specific post, comments are displayed as trees of replies. By default only the root of a tree is shown, and to see all the comments in a tree, you have to 'Expand' it. If the tree contains many comments, only some of them will be actually shown, and the rest will be treated as trees.</p>
    ", "wptc" );

    $widget_help = __( "<p><strong>Move widget</strong></p>
        <p>Using this widget you can move a comment to another post or page, by typing its title into the input area. To make it easier for you, this input provides hints, and will display posts and pages that match the letters you have typed.</p>    
        <p class='hide-if-no-js'>You can also inspect a thread of this comment by pressing 'Inspect', what will redirect you to a page, where the thread will be shown highlighted.</p>
    ", "wptc" );

    if( $screen_id == "comment" ){
        $contextual_help .= $widget_help;
    } else if ( $screen_id == "wp-tc-edit-comments" ){
        $contextual_help .= $threaded_comments_help.$moving_comments_help.$dropzone_help;
    } else if ( $screen_id == "edit-post" || $screen_id == "edit-page" ){
        $contextual_help .= $dropzone_help;
    }
    return $contextual_help;
}

/**
 * Registers required scripts adds options and tries to create neccessery symlinks.
 */
function tc_install(){
	tc_check_symlinks();

    add_option( "wptc_min_expand", "20", '', "yes" );
}

/**
 * Adds and displays errors according to the current state of symlinks
 */
function tc_admin_notices() {
    global $wp_tc_ec_link, $wp_tc_ec_file, $wp_tc_clt_link, $wp_tc_clt_file, $wp_tc_clt, $wp_tc_ec;

    $tc_ec_message = "<code>wp-tc-edit-comments.php</code>" . sprintf( __('link does not exist.%1$sCreate it by executing: %2$s in your server%1$s', "wptc"), "<br />" ,"<br /><code>ln -s $wp_tc_ec_file $wp_tc_ec_link</code><br />");
    $tc_clt_message = "<code>class-wp-tc-comments-list-table.php</code>" . sprintf( __('link does not exist.%1$sCreate it by executing: %2$s in your server%1$s', "wptc"), "<br />" ,"<br /><code>ln -s $wp_tc_clt_file $wp_tc_clt_link</code><br />");
    
    if(! $wp_tc_clt ) add_settings_error( "wp_tc_links", esc_attr( "tc-clt-link-error" ), $tc_clt_message );
    if(! $wp_tc_ec ) add_settings_error( "wp_tc_links", esc_attr( "tc-ec-link-error" ), $tc_ec_message );
    
    settings_errors( 'wp_tc_links' );
}

/**
 * Checks and creates symlinks required for correct running of this plugin.
 * @return true if both of them exist and work correctly
 */
function tc_check_symlinks(){
    global $wp_tc_ec_link, $wp_tc_ec_file, $wp_tc_clt_link, $wp_tc_clt_file, $wp_tc_clt, $wp_tc_ec;

    $wp_tc_clt = true;
    $wp_tc_ec = true;

	if ( basename( @readlink( $wp_tc_ec_link ) ) != basename( $wp_tc_ec_file ) ) {
		@unlink( $wp_tc_ec_link );
		if ( ! @symlink ( $wp_tc_ec_file, $wp_tc_ec_link ) ) {
    	    $wp_tc_ec = false;	
        }
	}

	if ( basename( @readlink( $wp_tc_clt_link ) ) != basename( $wp_tc_clt_file ) ) {
		@unlink( $wp_tc_clt_link );
		if ( ! @symlink ( $wp_tc_clt_file, $wp_tc_clt_link ) ) {
            $wp_tc_clt = false;
		}
	}

    return ( $wp_tc_ec && $wp_tc_clt );
}

function tc_uninstall(){
     unlink( $wp_tc_ec_link );
     unlink( $wp_tc_clt_link );
     delete_option( "wptc_min_expand" );
}

/**
 * Extended walker class, which instead of a HTML code generates JSON object
 * which represents a thread of comments. Also adds a couple of custom
 * properites to the objects: comment_depth, comment_page_number 
 * and comment_children, which are required for correctness of this plugin.
 */
class Walker_Comment_Threaded extends Walker_Comment {
    
    /**
     * Starts a new level of comments. Starts a JSON array.
     * @param $output   output after a walk
     * @param $depth    depth of the current comment    
     */
    function start_lvl( &$output, $depth ) {
		$GLOBALS['comment_depth'] = $depth + 1;
        
        $output .= '[';
        
	}
	
    /**
     * Ends a level of comments. Ends a JSON array.
     * @param $output   output after a walk
     * @param $depth    depth of the current comment    
     */
	function end_lvl( &$output, $depth ) {
		$GLOBALS['comment_depth'] = $depth + 1;

		$output .= '] ';
	}
    
    /**
     * Starts a new comments. Generates an PHP object, which is then converted
     * to a JSON string and added to output.
     * @param $output   output after a walk
     * @param $comment  comment's object which we're currently operating on
     * @param $depth    depth of the current comment
     * @param $args     additional arguments    
     */
	function start_el( &$output, $comment, $depth, $args ) {
		$depth ++;
		$GLOBALS['comment_depth'] = $depth;
		$GLOBALS['comment'] = $comment;
		extract($args, EXTR_SKIP);

        // Add a page number to the comment's properties 
        if( $args[0]['offset'] != '-1') {
                $comment -> comment_page_number = $args[0]['offset'] / $args[0]['per_page'] + 1;
        } else {
            $comment -> comment_page_number = 1;
        }
        
        $out = json_encode( $comment );
	    $out = substr( $out, 0, -1 );

        // Add comment's depth
	    $out .= ', "comment_depth" : "' . $depth . '"';

        // Add children if they exist
	    if( ! empty( $args['has_children'] ) ){
	    	$out .= ', "comment_children" : ';
	    } 

	    $output .= $out;
	}
	
	/**
     * Ends a comment. Ends a JSON object. No need for the depth parameter, as 
     * it's not important any more.
     * @param $output   output after a walk  
     */
	function end_el( &$output ) {
		$output .= '}, ';
	}

	/**
     * Walks through an array of comments, and organizes them together 
     * into threads
     * @param $elements     elements which will be built into a thread
     * @param $max_depth    max_depth of a comment
     */    
    function walk( $elements, $max_depth ) {
        $args = array_slice( func_get_args(), 4 );
        $output = parent::walk( $elements, $max_depth, $args );
        $output = str_replace( array( ', }', ', ]' ), array( '}', ']' ), '[' . $output .']' );
        return $output;
    }

	/**
     * Walks through an array of comments, and organizes them together 
     * into threads, divided between pages.
     * @param $elements     elements which will be built into a thread
     * @param $max_depth    max_depth of a comment
     * @param $page_num     number of a page we're walking through
     * @param $per_page     number of comments per page
     */        
    function paged_walk( $elements, $max_depth, $page_num, $per_page ) {
        $args = array_slice( func_get_args(), 4 );
        $output = parent::paged_walk( $elements, $max_depth, $page_num, $per_page, $args );
        $output = str_replace( array( ', }', ', ]' ), array( '}', ']' ), '[' . $output . ']' );
        return $output;
    }
    
}
