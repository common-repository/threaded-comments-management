<?php
/**
 * Comments and Post Comments List Table classes.
 *
 * @package ThreadedComments
 */


/**
 * Overwritten and extended Comments List Table class.
 *
 * @package ThreadedComments
 * @access private
 */
require_once(ABSPATH . 'wp-admin/includes/class-wp-comments-list-table.php');
require_once(ABSPATH . 'wp-admin/includes/class-wp-list-table.php');
require_once('wp-tc-functions.php');

/*
 * Comments List Table, column_comment modified by adding a wrapper around 
 * "In reply to".
 */
class WP_TC_NT_Comments_List_Table extends WP_Comments_List_Table {
     function get_bulk_actions() {
          $actions = parent::get_bulk_actions();
		
          $actions['tcMvToDropzone'] = __( 'Add to Dropzone', "wptc" );
          $actions['tcMvTo'] = __( 'Move Comments', "wptc" );
          $actions['tcRmFromDropzone'] = __( 'Remove from Dropzone', "wptc" );

		return $actions;
	}

    function column_comment( $comment ) {
		global $post, $comment_status, $the_comment_status;

		$user_can = $this->user_can;

		$comment_url = esc_url( get_comment_link( $comment->comment_ID ) );

		$ptime = date( 'G', strtotime( $comment->comment_date ) );
		if ( ( abs( time() - $ptime ) ) < 86400 )
			$ptime = sprintf( __( '%s ago' ), human_time_diff( $ptime ) );
		else
			$ptime = mysql2date( __( 'Y/m/d \a\t g:i A' ), $comment->comment_date );

		if ( $user_can ) {
			$del_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "delete-comment_$comment->comment_ID" ) );
			$approve_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "approve-comment_$comment->comment_ID" ) );
            $tc_move_nonce = wp_create_nonce( "tc-move-comment_$comment->comment_ID" );

			$url = "comment.php?c=$comment->comment_ID";

			$approve_url = esc_url( $url . "&action=approvecomment&$approve_nonce" );
			$unapprove_url = esc_url( $url . "&action=unapprovecomment&$approve_nonce" );
			$spam_url = esc_url( $url . "&action=spamcomment&$del_nonce" );
			$unspam_url = esc_url( $url . "&action=unspamcomment&$del_nonce" );
			$trash_url = esc_url( $url . "&action=trashcomment&$del_nonce" );
			$untrash_url = esc_url( $url . "&action=untrashcomment&$del_nonce" );
			$delete_url = esc_url( $url . "&action=deletecomment&$del_nonce" );
		}

        echo '<div id="comment-tc-move-nonce-' . $comment->comment_ID . '" class="hidden">' . $tc_move_nonce . '</div>';

		echo '<div class="submitted-on">';
		/* translators: 2: comment date, 3: comment time */
		printf( __( 'Submitted on <a class="comment-submitted-on" href="%1$s">%2$s at %3$s</a>' ), $comment_url,
			/* translators: comment date format. See http://php.net/date */ get_comment_date( __( 'Y/m/d' ) ),
			/* translators: comment time format. See http://php.net/date */ get_comment_date( get_option( 'time_format' ) ) );

		if ( $comment->comment_parent ) {
			$parent = get_comment( $comment->comment_parent );
			$parent_link = esc_url( get_comment_link( $comment->comment_parent ) );
			$name = get_comment_author( $parent->comment_ID );
			printf( '<span class="comment-parent-span"> | '.__( 'In reply to <a class="comment-parent comment-parent-id-%1s" href="%2$s">%3$s</a>.</span>' ), $parent->comment_ID, $parent_link, $name );
		}

		echo '</div>';
		comment_text();
		if ( $user_can ) { ?>
		<div id="inline-<?php echo $comment->comment_ID; ?>" class="hidden">
		<textarea class="comment" rows="1" cols="1"><?php echo esc_textarea( apply_filters( 'comment_edit_pre', $comment->comment_content ) ); ?></textarea>
		<div class="author-email"><?php echo esc_attr( $comment->comment_author_email ); ?></div>
		<div class="author"><?php echo esc_attr( $comment->comment_author ); ?></div>
		<div class="author-url"><?php echo esc_attr( $comment->comment_author_url ); ?></div>
		<div class="comment_status"><?php echo $comment->comment_approved; ?></div>
		</div>
		<?php
		}

		if ( $user_can ) {
			// preorder it: Approve | Reply | Quick Edit | Edit | Spam | Trash
			$actions = array(
				'approve' => '', 'unapprove' => '',
				'reply' => '',
				'quickedit' => '',
				'edit' => '',
				'spam' => '', 'unspam' => '',
				'trash' => '', 'untrash' => '', 'delete' => ''
			);

			if ( $comment_status && 'all' != $comment_status ) { // not looking at all comments
				if ( 'approved' == $the_comment_status )
					$actions['unapprove'] = "<a href='$unapprove_url' class='delete:the-comment-list:comment-$comment->comment_ID:e7e7d3:action=dim-comment&amp;new=unapproved vim-u vim-destructive' title='" . esc_attr__( 'Unapprove this comment' ) . "'>" . __( 'Unapprove' ) . '</a>';
				else if ( 'unapproved' == $the_comment_status )
					$actions['approve'] = "<a href='$approve_url' class='delete:the-comment-list:comment-$comment->comment_ID:e7e7d3:action=dim-comment&amp;new=approved vim-a vim-destructive' title='" . esc_attr__( 'Approve this comment' ) . "'>" . __( 'Approve' ) . '</a>';
			} else {
				$actions['approve'] = "<a href='$approve_url' class='dim:the-comment-list:comment-$comment->comment_ID:unapproved:e7e7d3:e7e7d3:new=approved vim-a' title='" . esc_attr__( 'Approve this comment' ) . "'>" . __( 'Approve' ) . '</a>';
				$actions['unapprove'] = "<a href='$unapprove_url' class='dim:the-comment-list:comment-$comment->comment_ID:unapproved:e7e7d3:e7e7d3:new=unapproved vim-u' title='" . esc_attr__( 'Unapprove this comment' ) . "'>" . __( 'Unapprove' ) . '</a>';
			}

			if ( 'spam' != $the_comment_status && 'trash' != $the_comment_status ) {
				$actions['spam'] = "<a href='$spam_url' class='delete:the-comment-list:comment-$comment->comment_ID::spam=1 vim-s vim-destructive' title='" . esc_attr__( 'Mark this comment as spam' ) . "'>" . /* translators: mark as spam link */ _x( 'Spam', 'verb' ) . '</a>';
			} elseif ( 'spam' == $the_comment_status ) {
				$actions['unspam'] = "<a href='$unspam_url' class='delete:the-comment-list:comment-$comment->comment_ID:66cc66:unspam=1 vim-z vim-destructive'>" . _x( 'Not Spam', 'comment' ) . '</a>';
			} elseif ( 'trash' == $the_comment_status ) {
				$actions['untrash'] = "<a href='$untrash_url' class='delete:the-comment-list:comment-$comment->comment_ID:66cc66:untrash=1 vim-z vim-destructive'>" . __( 'Restore' ) . '</a>';
			}

			if ( 'spam' == $the_comment_status || 'trash' == $the_comment_status || !EMPTY_TRASH_DAYS ) {
				$actions['delete'] = "<a href='$delete_url' class='delete:the-comment-list:comment-$comment->comment_ID::delete=1 delete vim-d vim-destructive'>" . __( 'Delete Permanently' ) . '</a>';
			} else {
				$actions['trash'] = "<a href='$trash_url' class='delete:the-comment-list:comment-$comment->comment_ID::trash=1 delete vim-d vim-destructive' title='" . esc_attr__( 'Move this comment to the trash' ) . "'>" . _x( 'Trash', 'verb' ) . '</a>';
			}

			if ( 'trash' != $the_comment_status ) {
				$actions['edit'] = "<a href='comment.php?action=editcomment&amp;c={$comment->comment_ID}' title='" . esc_attr__( 'Edit comment' ) . "'>". __( 'Edit' ) . '</a>';
				$actions['quickedit'] = '<a onclick="commentReply.open( \''.$comment->comment_ID.'\',\''.$post->ID.'\',\'edit\' );return false;" class="vim-q" title="'.esc_attr__( 'Quick Edit' ).'" href="#">' . __( 'Quick&nbsp;Edit' ) . '</a>';
				if ( 'spam' != $the_comment_status )
					$actions['reply'] = '<a onclick="commentReply.open( \''.$comment->comment_ID.'\',\''.$post->ID.'\' );return false;" class="vim-r" title="'.esc_attr__( 'Reply to this comment' ).'" href="#">' . __( 'Reply' ) . '</a>';
			}
			
			$actions = apply_filters( 'comment_row_actions', array_filter( $actions ), $comment );

			$i = 0;
			echo '<div class="row-actions">';
			foreach ( $actions as $action => $link ) {
				++$i;
				( ( ( 'approve' == $action || 'unapprove' == $action ) && 2 === $i ) || 1 === $i ) ? $sep = '' : $sep = ' | ';

				// Reply and quickedit need a hide-if-no-js span when not added with ajax
				if ( ( 'reply' == $action || 'quickedit' == $action ) && ! defined('DOING_AJAX') )
					$action .= ' hide-if-no-js';
				elseif ( ( $action == 'untrash' && $the_comment_status == 'trash' ) || ( $action == 'unspam' && $the_comment_status == 'spam' ) ) {
					if ( '1' == get_comment_meta( $comment->comment_ID, '_wp_trash_meta_status', true ) )
						$action .= ' approve';
					else
						$action .= ' unapprove';
				}

				echo "<span class='$action'>$sep$link</span>";
			}
			echo '</div>';
		}

	}
}

class WP_TC_Comments_List_Table extends WP_Comments_List_Table {

	function prepare_items($comment_id = 0) {
		global $post_id, $comment_status, $search, $comment_type;

		$comment_status = isset( $_REQUEST['comment_status'] ) ? $_REQUEST['comment_status'] : 'all';
		if ( !in_array( $comment_status, array( 'all', 'moderated', 'approved', 'spam', 'trash' ) ) )
			$comment_status = 'all';

		$comment_type = !empty( $_REQUEST['comment_type'] ) ? $_REQUEST['comment_type'] : '';

		$search = ( isset( $_REQUEST['s'] ) ) ? $_REQUEST['s'] : '';

		$user_id = ( isset( $_REQUEST['user_id'] ) ) ? $_REQUEST['user_id'] : '';

		$orderby = ( isset( $_REQUEST['orderby'] ) ) ? $_REQUEST['orderby'] : '';
		$order = ( isset( $_REQUEST['order'] ) ) ? $_REQUEST['order'] : '';

		$comments_per_page = $this->get_per_page( $comment_status );

		$doing_ajax = defined( 'DOING_AJAX' ) && DOING_AJAX;

		if ( isset( $_REQUEST['number'] ) ) {
			$number = (int) $_REQUEST['number'];
		}
		else {
			$number = $comments_per_page + min( 8, $comments_per_page ); // Grab a few extra
		}

		$page = $this->get_pagenum();

		if ( isset( $_REQUEST['start'] ) ) {
			$start = $_REQUEST['start'];
		} else {
			$start = ( $page - 1 ) * $comments_per_page;
		}

		if ( $doing_ajax && isset( $_REQUEST['offset'] ) ) {
			$start += $_REQUEST['offset'];
		}

		$status_map = array(
			'moderated' => 'hold',
			'approved' => 'approve'
		);

		$args = array(
			'status' => isset( $status_map[$comment_status] ) ? $status_map[$comment_status] : $comment_status,
			'search' => $search,
			'user_id' => $user_id,
			'offset' => $start,
			'number' => $number,
			'post_id' => $post_id,
			'type' => $comment_type,
			'orderby' => $orderby,
			'order' => $order,
            'per_page' => $comments_per_page,
          );

        if( $comment_type || $search ) $_comments = get_comments( $args );
		else if( $comment_id == 0 ) $_comments = tc_comments_get( $args );
        else $_comments = tc_comments_get("comment_ID = $comment_id");		

        $_comments_flat = tc_comments_flatten( $_comments );
		
		update_comment_cache( $_comments );

		$this->items = array_slice( $_comments, 0, $comments_per_page );
		$this->extra_items = array_slice( $_comments, $comments_per_page );

		$total_comments = get_comments( array_merge( $args, array('count' => true, 'offset' => 0, 'number' => 0) ) );

		$_comment_post_ids = array();
		foreach ( $_comments_flat as $_c ) {
			$_comment_post_ids[] = $_c->comment_post_ID;
		}

		$this->pending_count = get_pending_comments_num( $_comment_post_ids );

		$this->set_pagination_args( array(
			'total_items' => $total_comments,
			'per_page' => $comments_per_page,
		) );
	}

     function display_rows() {        
     	foreach ( $this -> items as $item ){            
                    $comments_flat = tc_comments_flatten( array( $item ) );
                    foreach ( $comments_flat as $comment ){
			          $this -> single_row( $comment );
                    }
          }
	}

	function column_comment( $comment ) {
		echo '<div class="depth-indicator depth-'.$comment->comment_depth.'">';
		echo '<div class="depth-padding">';
		global $post, $comment_status, $the_comment_status;

		$user_can = $this->user_can;

		$comment_url = esc_url( get_comment_link( $comment->comment_ID ) );

		$ptime = date( 'G', strtotime( $comment->comment_date ) );
		if ( ( abs( time() - $ptime ) ) < 86400 )
			$ptime = sprintf( __( '%s ago' ), human_time_diff( $ptime ) );
		else
			$ptime = mysql2date( __( 'Y/m/d \a\t g:i A' ), $comment->comment_date );

		if ( $user_can ) {
			$del_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "delete-comment_$comment->comment_ID" ) );
			$approve_nonce = esc_html( '_wpnonce=' . wp_create_nonce( "approve-comment_$comment->comment_ID" ) );
            $tc_move_nonce = wp_create_nonce( "tc-move-comment_$comment->comment_ID" );

			$url = "comment.php?c=$comment->comment_ID";

			$approve_url = esc_url( $url . "&action=approvecomment&$approve_nonce" );
			$unapprove_url = esc_url( $url . "&action=unapprovecomment&$approve_nonce" );
			$spam_url = esc_url( $url . "&action=spamcomment&$del_nonce" );
			$unspam_url = esc_url( $url . "&action=unspamcomment&$del_nonce" );
			$trash_url = esc_url( $url . "&action=trashcomment&$del_nonce" );
			$untrash_url = esc_url( $url . "&action=untrashcomment&$del_nonce" );
			$delete_url = esc_url( $url . "&action=deletecomment&$del_nonce" );
		}

        echo '<div id="comment-tc-move-nonce-' . $comment->comment_ID . '" class="hidden">' . $tc_move_nonce . '</div>';

		echo '<div class="submitted-on">';
		/* translators: 2: comment date, 3: comment time */
		printf( __( 'Submitted on <a class="comment-submitted-on" href="%1$s">%2$s at %3$s</a>' ), $comment_url,
			/* translators: comment date format. See http://php.net/date */ get_comment_date( __( 'Y/m/d' ) ),
			/* translators: comment time format. See http://php.net/date */ get_comment_date( get_option( 'time_format' ) ) );

		if ( $comment->comment_parent ) {
			$parent = get_comment( $comment->comment_parent );
			$parent_link = esc_url( get_comment_link( $comment->comment_parent ) );
			$name = get_comment_author( $parent->comment_ID );
			printf( '<span class="comment-parent-span"> | '.__( 'In reply to <a class="comment-parent comment-parent-id-%1s" href="%2$s">%3$s</a>.</span>' ), $parent->comment_ID,$parent_link, $name );
		}
		
		if( $comment -> number_of_children > 0){
			printf( '<span class="comment-noc-span"> | ' . _n( 'Has <span class="comment-noc">%d</span> reply.</span>', 'Has <span class="comment-noc">%d</span> replies.</span>', $comment -> number_of_children, "wptc" ), $comment -> number_of_children );
		}

		echo '</div>';
		comment_text();
		if ( $user_can ) { ?>
		<div id="inline-<?php echo $comment->comment_ID; ?>" class="hidden">
		<textarea class="comment" rows="1" cols="1"><?php echo esc_textarea( apply_filters( 'comment_edit_pre', $comment->comment_content ) ); ?></textarea>
		<div class="author-email"><?php echo esc_attr( $comment->comment_author_email ); ?></div>
		<div class="author"><?php echo esc_attr( $comment->comment_author ); ?></div>
		<div class="author-url"><?php echo esc_attr( $comment->comment_author_url ); ?></div>
		<div class="comment_status"><?php echo $comment->comment_approved; ?></div>
		</div>
		<?php
		}

		if ( $user_can ) {
			// preorder it: Approve | Reply | Quick Edit | Edit | Spam | Trash
			$actions = array(
				'expand' => '', 'collapse' => '',
				'approve' => '', 'unapprove' => '',
				'reply' => '',
				'quickedit' => '',
				'edit' => '',
				'spam' => '', 'unspam' => '',
				'trash' => '', 'untrash' => '', 'delete' => ''
			);

			if ( $comment_status && 'all' != $comment_status ) { // not looking at all comments
				if ( 'approved' == $the_comment_status )
					$actions['unapprove'] = "<a href='$unapprove_url' class='delete:the-comment-list:comment-$comment->comment_ID:e7e7d3:action=dim-comment&amp;new=unapproved vim-u vim-destructive' title='" . esc_attr__( 'Unapprove this comment' ) . "'>" . __( 'Unapprove' ) . '</a>';
				else if ( 'unapproved' == $the_comment_status )
					$actions['approve'] = "<a href='$approve_url' class='delete:the-comment-list:comment-$comment->comment_ID:e7e7d3:action=dim-comment&amp;new=approved vim-a vim-destructive' title='" . esc_attr__( 'Approve this comment' ) . "'>" . __( 'Approve' ) . '</a>';
			} else {
				$actions['approve'] = "<a href='$approve_url' class='dim:the-comment-list:comment-$comment->comment_ID:unapproved:e7e7d3:e7e7d3:new=approved vim-a' title='" . esc_attr__( 'Approve this comment' ) . "'>" . __( 'Approve' ) . '</a>';
				$actions['unapprove'] = "<a href='$unapprove_url' class='dim:the-comment-list:comment-$comment->comment_ID:unapproved:e7e7d3:e7e7d3:new=unapproved vim-u' title='" . esc_attr__( 'Unapprove this comment' ) . "'>" . __( 'Unapprove' ) . '</a>';
			}

			if ( 'spam' != $the_comment_status && 'trash' != $the_comment_status ) {
				$actions['spam'] = "<a href='$spam_url' class='delete:the-comment-list:comment-$comment->comment_ID::spam=1 vim-s vim-destructive' title='" . esc_attr__( 'Mark this comment as spam' ) . "'>" . /* translators: mark as spam link */ _x( 'Spam', 'verb' ) . '</a>';
			} elseif ( 'spam' == $the_comment_status ) {
				$actions['unspam'] = "<a href='$unspam_url' class='delete:the-comment-list:comment-$comment->comment_ID:66cc66:unspam=1 vim-z vim-destructive'>" . _x( 'Not Spam', 'comment' ) . '</a>';
			} elseif ( 'trash' == $the_comment_status ) {
				$actions['untrash'] = "<a href='$untrash_url' class='delete:the-comment-list:comment-$comment->comment_ID:66cc66:untrash=1 vim-z vim-destructive'>" . __( 'Restore' ) . '</a>';
			}

			if ( 'spam' == $the_comment_status || 'trash' == $the_comment_status || !EMPTY_TRASH_DAYS ) {
				$actions['delete'] = "<a href='$delete_url' class='delete:the-comment-list:comment-$comment->comment_ID::delete=1 delete vim-d vim-destructive'>" . __( 'Delete Permanently' ) . '</a>';
			} else {
				$actions['trash'] = "<a href='$trash_url' class='delete:the-comment-list:comment-$comment->comment_ID::trash=1 delete vim-d vim-destructive' title='" . esc_attr__( 'Move this comment to the trash' ) . "'>" . _x( 'Trash', 'verb' ) . '</a>';
			}

			if ( 'trash' != $the_comment_status ) {
				$actions['edit'] = "<a href='comment.php?action=editcomment&amp;c={$comment->comment_ID}' title='" . esc_attr__( 'Edit comment' ) . "'>". __( 'Edit' ) . '</a>';
				$actions['quickedit'] = '<a onclick="commentReply.open( \''.$comment->comment_ID.'\',\''.$post->ID.'\',\'edit\' );return false;" class="vim-q" title="'.esc_attr__( 'Quick Edit' ).'" href="#">' . __( 'Quick&nbsp;Edit' ) . '</a>';
				if ( 'spam' != $the_comment_status )
					$actions['reply'] = '<a onclick="commentReply.open( \''.$comment->comment_ID.'\',\''.$post->ID.'\' );return false;" class="vim-r" title="'.esc_attr__( 'Reply to this comment' ).'" href="#">' . __( 'Reply' ) . '</a>';
			}

			if($comment -> number_of_children > 0){
				$actions['expand'] = '<a class="tc-show-more" href="#depth-' . ($comment -> comment_depth + 1) . '">' . __( 'Expand', "wptc" ) . '</a>';
			
			}
			
			$actions = apply_filters( 'comment_row_actions', array_filter( $actions ), $comment );

			$i = 0;
			echo '<div class="row-actions">';
			foreach ( $actions as $action => $link ) {
				++$i;
				( ( ( 'approve' == $action || 'unapprove' == $action ) && 2 === $i ) || 1 === $i ) ? $sep = '' : $sep = ' | ';

				// Reply and quickedit need a hide-if-no-js span when not added with ajax
				if ( ( 'reply' == $action || 'quickedit' == $action ) && ! defined('DOING_AJAX') )
					$action .= ' hide-if-no-js';
				elseif ( ( $action == 'untrash' && $the_comment_status == 'trash' ) || ( $action == 'unspam' && $the_comment_status == 'spam' ) ) {
					if ( '1' == get_comment_meta( $comment->comment_ID, '_wp_trash_meta_status', true ) )
						$action .= ' approve';
					else
						$action .= ' unapprove';
				}

				echo "<span class='$action'>$sep$link</span>";
			}
			echo '</div>';
		}
		echo '</div></div>';

	}
	
	function single_row( $a_comment ) {
		global $post, $comment, $the_comment_status;

		$comment = $a_comment;
		$the_comment_status = wp_get_comment_status( $comment -> comment_ID );

		$post = get_post( $comment -> comment_post_ID );

		$this->user_can = current_user_can( 'edit_comment', $comment -> comment_ID );

		echo "<tr id='comment-$comment->comment_ID' class='$the_comment_status depth-$comment->comment_depth droppable draggable'";
		echo ">";
		echo $this -> single_row_columns( $comment );
		echo "</tr>";
	}

     function get_bulk_actions() {
          $actions = parent::get_bulk_actions();
		
          $actions['tcMvToDropzone'] = __( 'Add to Dropzone', "wptc" );
          $actions['tcMvTo'] = __( 'Move Comments', "wptc" );
          $actions['tcRmFromDropzone'] = __( 'Remove from Dropzone', "wptc" );
          $actions['tcMvToRoot'] = __( 'Root them', "wptc" );

		return $actions;
	}
}

/**
 * Post Comments List Table class.
 *
 * @package WordPress
 * @subpackage List_Table
 * @since 3.1.0
 * @access private
 *
 * @see WP_Comments_Table
 */
class WP_TC_Post_Comments_List_Table extends WP_Post_Comments_List_Table {

}

?>
