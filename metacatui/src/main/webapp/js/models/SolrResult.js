/*global define */
define(['jquery', 'underscore', 'backbone'], 				
	function($, _, Backbone) {
	'use strict';

	// SolrResult Model
	// ------------------
	var SolrResult = Backbone.Model.extend({
		// This model contains all of the attributes found in the SOLR 'docs' field inside of the SOLR response element
		defaults: {
			origin: '',
			title: '',
			pubDate: '',
			id: '',
			resourceMap: null,
			downloads: null,
			citations: 0,
			selected: false,
			formatId: null,
			formatType: null,
			memberNode: null
		},
		
		// Toggle the `selected` state of the result
		toggle: function () {
			this.selected = !this.get('selected');
		}
		
	});
	return SolrResult;
});
