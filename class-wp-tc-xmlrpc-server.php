<?php

/**
 * @package ThreadedComments
 */

include_once(ABSPATH . WPINC . '/class-IXR.php');
include_once(ABSPATH . WPINC . '/class-wp-xmlrpc-server.php');
include_once('wp-tc-functions.php');


class wp_tc_xmlrpc_server extends wp_xmlrpc_server {
	function __construct(){
		parent::__construct();
		$this -> methods['tc.moveComment'] = 'this:tc_moveComment';
		$this -> methods['tc.reparentComment'] =  'this:tc_reparentComment';
	}

     public static function get_name() {
        return __CLASS__;
     }

	function tc_moveComment( $args ){
		$this -> escape( $args );
		$blog_id	= (int) $args[0];
		$username	= $args[1];
		$password	= $args[2];
		$comment_ID	= (int) $args[3];
		$post_ID 	= (int) $args[4];
		$single 	= (int) $args[5];
		
		if ( !$user = $this -> login( $username, $password ) )
			return $this -> error;

		if ( !current_user_can( 'moderate_comments' ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		if ( !current_user_can( 'edit_comment', $comment_ID ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		do_action( 'xmlrpc_call', 'tc.moveComment' );
		
		$result = tc_comment_move( array( $comment_ID ), array( $post_ID ), array( $single ) );

		return true;
	}
	function tc_reparentComment( $args ){
		$this -> escape( $args );

		$blog_id	= (int) $args[0];
		$username	= $args[1];
		$password	= $args[2];
		$comment_ID	= (int) $args[3];
		$parent_ID 	= (int) $args[4];
		$single 	= (int) $args[5];
		
		if ( !$user = $this -> login( $username, $password ) )
			return $this -> error;

		if ( !current_user_can( 'moderate_comments' ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		if ( !current_user_can( 'edit_comment', $comment_ID ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		do_action( 'xmlrpc_call', 'tc.reparentComment' );

		if ( ! get_comment( $comment_ID ) )
			return new IXR_Error( 404, __( 'Invalid comment ID.' ) );
		
		if ( ! get_comment( $parent_ID ) )
			return new IXR_Error( 404, __( 'Invalid parent ID.' ) );
		
		$result = tc_comment_reparent( array( $comment_ID ), array( $parent_ID ), array( $single ) );
		
		if ( is_wp_error( $result ) )
			return new IXR_Error( 500, $result -> get_error_message() );

		if ( ! $result )
			return new IXR_Error( 500, __( 'Sorry, the comment could not be edited. Something wrong happened.' ) );

		return true;
	}

	/*
	 * @Override
	 */
	function wp_editComment( $args ) {
		$this -> escape( $args );

		$blog_id	= (int) $args[0];
		$username	= $args[1];
		$password	= $args[2];
		$comment_ID	= (int) $args[3];
		$content_struct = $args[4];

		
		if ( ! $user = $this -> login( $username, $password ) )
			return $this -> error;

		if ( ! current_user_can( 'moderate_comments' ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		if ( !current_user_can( 'edit_comment', $comment_ID ) )
			return new IXR_Error( 403, __( 'You are not allowed to moderate comments on this site.' ) );

		do_action( 'xmlrpc_call', 'wp.editComment' );

		if ( ! get_comment( $comment_ID ) )
			return new IXR_Error( 404, __( 'Invalid comment ID.' ) );

		if ( isset( $content_struct['status'] ) ) {
			$statuses = get_comment_statuses();
			$statuses = array_keys( $statuses );

			if ( ! in_array( $content_struct['status'], $statuses ) )
				return new IXR_Error( 401, __( 'Invalid comment status.' ) );
			$comment_approved = $content_struct['status'];
		}

		// Do some timestamp voodoo
		if ( !empty( $content_struct['date_created_gmt'] ) ) {
			$dateCreated = str_replace( 'Z', '', $content_struct['date_created_gmt'] -> getIso() ) . 'Z'; // We know this is supposed to be GMT, so we're going to slap that Z on there by force
			$comment_date = get_date_from_gmt( iso8601_to_datetime( $dateCreated ) );
			$comment_date_gmt = iso8601_to_datetime( $dateCreated, 'GMT' );
		}

		if ( isset( $content_struct['content'] ) )
			$comment_content = $content_struct['content'];

		if ( isset( $content_struct['author'] ) )
			$comment_author = $content_struct['author'];

		if ( isset( $content_struct['author_url'] ) )
			$comment_author_url = $content_struct['author_url'];

		if ( isset( $content_struct['author_email'] ) )
			$comment_author_email = $content_struct['author_email'];

		// We've got all the data -- post it:
		$comment = compact('comment_ID', 'comment_content', 'comment_approved', 'comment_date', 'comment_date_gmt', 'comment_author', 'comment_author_email', 'comment_author_url', 'comment_parent', 'comment_post_ID');

		$result = wp_update_comment( $comment );
		if ( is_wp_error( $result ) )
			return new IXR_Error( 500, $result -> get_error_message() );

		if ( !$result )
			return new IXR_Error( 500, __( 'Sorry, the comment could not be edited. Something wrong happened.' ) );

		return true;
	}
}

?>
