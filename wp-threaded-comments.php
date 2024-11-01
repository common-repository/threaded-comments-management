<?php
/*
Plugin Name: Threaded Comments Management
Version: 1.0.1
Author: azram19
Plugin URI: http://gsoc2011.wordpress.com/threaded-comments
Description: Plugin improves threaded comments management.
Text Domain: wptc
License: GPL2

    Copyright 2011  azram19  (email : azram19@gmail.com)

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License, version 2, as 
    published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program; if not, write to the Free Software
    Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

$wp_tc_ec_link = ABSPATH . "wp-admin/wp-tc-edit-comments.php";
$wp_tc_ec_file = WP_PLUGIN_DIR . "/threaded-comments-management/wp-tc-edit-comments.php";
$wp_tc_clt_link = ABSPATH . "wp-admin/includes/class-wp-tc-comments-list-table.php";
$wp_tc_clt_file = WP_PLUGIN_DIR . "/threaded-comments-management/class-wp-tc-comments-list-table.php";
$wp_tc_clt = true;
$wp_tc_ec = true;
require_once( "wp-tc-functions.php" );
require_once( "class-wp-tc-xmlrpc-server.php" );

tc_check_symlinks();

/*
 * Overwrite update_comment with a function that supports modification of 
 * `comment_post_ID' and `comment_parent`.
 */
remove_all_filters( 'wp_update_comment' );
add_filter( 'wp_update_comment', 'tc_update_comment', 1, 1 );

add_filter( 'init', 'tc_init', 1, 1 );

//Load javascript files and css
add_filter( 'admin_init', 'tc_js', 1, 1 );
add_filter( 'admin_print_styles', 'tc_styles' );

//Extend XML-RPC
add_filter( 'wp_xmlrpc_server_class', array( 'wp_tc_xmlrpc_server', 'get_name' ) );

//Ajax actions
add_action( 'wp_ajax_search-post-by-title', 'tc_ajax_post_search' );
add_action( 'wp_ajax_move-by-title', 'tc_ajax_move_by_title' );
add_action( 'wp_ajax_move-comment', 'tc_ajax_move_comment' );
add_action( 'wp_ajax_get-comment-subthread', 'tc_ajax_get_comment_subthread' );
add_action( 'wp_ajax_save_settings-wptc', 'tc_ajax_save_settings' );

//Disable sortable column in comments page
add_filter( 'manage_wp-tc-edit-comments_sortable_columns', 'tc_deregister_sortable' );

//Redirect eidt-comments.php to a custom page
add_action( 'admin_head-edit-comments.php', 'tc_redirect_to_threaded_view' );

//Activate/Deactivate
register_deactivation_hook( __FILE__, 'tc_uninstall' );
register_activation_hook( __FILE__, 'tc_install' );

//On-screen options
add_filter( 'screen_settings', 'tc_screen_settings', 10, 2 );
add_filter( 'contextual_help', 'tc_contextual_help', 10, 3 );
add_action( 'admin_notices', 'tc_admin_notices' );

?>
