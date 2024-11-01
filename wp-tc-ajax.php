<?php
/**
 * Threaded Comments AJAX functions.
 *
 * actions: 
 *          - search-post-by-title  - returns a list of posts, found by 
                                    matching their title
 *          - move-by-title         - moves a comment to a title by its post
 *          - move-comment          - moves a comment to a different post
 *          - get-comment-subthread - returns a subthread of a comment
 *          - save_settings-wptc    - saves settings
 * 
 * @package ThreadedComments
 */
require_once("wp-tc-functions.php");

/**
 * Gets a json encoded array of comments with given ids, with their subthreads.
 * action: get-comment-subthread 
 */
function tc_ajax_get_comment_subthread(){
     $requestedComments = array();

     $commentId = $_REQUEST['c'];
     $commentIds = $_REQUEST['cs'];
     
     $single = $_REQUEST['single'];
     
     if( ! isset( $commentIds ) ){
        $commentIds = array( $commentId );
     }

     foreach( $commentIds as $commentId ){
  
         $comment = get_comment( $commentId );
         $parent = get_comment( $parentId );
     
         
         $subthread = tc_comments_get( array(
              'comment_ID'   => $commentId,
              'post_id'      => $comment -> comment_post_ID,
              'subthread'    => 'true',
         ) );

         $_subthread = tc_comments_flatten( $subthread ); 
     
         if( $single == "true" ){
            $_subthread = tc_filter( $_subthread, $commentId, 'true' );
         }        
        
         foreach( $_subthread as $comment ){
            $tc_move_nonce = wp_create_nonce( "tc-move-comment_$comment->comment_ID" );
  			$del_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "delete-comment_$comment->comment_ID" ) );
			$approve_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "approve-comment_$comment->comment_ID" ) );


            $comment -> wp_nonce_move = $tc_move_nonce;
            $comment -> wp_nonce_del = $del_nonce;
            $comment -> wp_nonce_approve = $approve_nonce;

            $comment -> comment_date_formatted = sprintf( 
                '%1$s at %2$s', 
                date( __( 'Y/m/d' ), strtotime( $comment -> comment_date ) ), 
                date( get_option( 'time_format' ), strtotime( $comment -> comment_date ) ) 
            );

            $comment -> comment_parent_author = get_comment( $comment  -> comment_parent ) -> comment_author;
            $comment -> comment_author_avatar = get_avatar( $comment, 32 );
         }    

         if( $single == "true" ){
            $_subthread = $_subthread[0];
         }

         $requestedComments[] = $_subthread; 
    }

     echo json_encode( $requestedComments );     
     die();
}

/**
 * Moves a comment to another post, it uses posts's title (or a part of it) 
 * to determine the post.
 * action: move-by-title
 */
function tc_ajax_move_by_title(){
    $id = tc_get_posts_by_title( $_REQUEST['title'] );
	$id = absint( $id[0]['ID'] );
	$comment_id = absint( $_REQUEST['c'] );
    
    check_admin_referer( "tc-move-comment_".$comment_id );

	$comment = get_comment( $comment_id );
	$single = $_REQUEST['single'];

	if( $comment -> comment_post_ID != $id ){
		tc_comment_move( array( $comment_id ), array( $id ), array( $single) );
    }	
    die();
}

/**
 * Moves a comment to another post.
 * action: move-comment
 */
function tc_ajax_move_comment(){
	$post_id = absint( $_REQUEST['postid'] );
	$comment_id = absint( $_REQUEST['c'] );
    $parent_id = absint( $_REQUEST['parent'] );

    check_admin_referer( "tc-move-comment_".$comment_id );

    $comment = get_comment( $comment_id );
	$single = $_REQUEST['single'];

    if( $post_id  != $comment -> comment_post_ID ){
	    tc_comment_move( array( $comment_id ), array( $post_id ), array( $single ) );    
    }
    if( $comment_id  != $parent_id ){
		tc_comment_reparent( array( $comment_id ), array( $parent_id ), array( $single ) );    
    }
	die();
}

/**
 * Saves wptc settings (currently only wptc_min_expand).
 * action: save_settings-wptc
 */
function tc_ajax_save_settings(){
    $tc_options = array(
        "wptc_min_expand",    
    );
    
    foreach( $tc_options as $option ){
        update_option( $option, $_REQUEST[$option] );
    }
    die();
}

/**
 * Returns an array of posts which titles match a given string.
 * action: search-post-by-title
 */
function tc_ajax_post_search(){
	$q = $_GET['q'];
	$results = tc_get_posts_by_title( $q );
	$i = 1; 
	foreach( $results as $post ){
		echo $post['post_title'];
		if( $i < count( $results ) ) echo " | ";
		$i++;	
	}

	die();
}
?>
