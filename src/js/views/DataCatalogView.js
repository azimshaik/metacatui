/*global define */
define(['jquery',
				'jqueryui',
				'underscore',
				'backbone',
				'bioportal',
				'collections/SolrResults',
				'models/Search',
				'models/Stats',
				'models/MetricsModel',
				'views/SearchResultView',
				'text!templates/search.html',
				'text!templates/statCounts.html',
				'text!templates/pager.html',
				'text!templates/mainContent.html',
				'text!templates/currentFilter.html',
				'text!templates/loading.html',
				'gmaps',
				'nGeohash'
				],
	function($, $ui, _, Backbone, Bioportal, SearchResults, SearchModel, StatsModel, MetricsModel, SearchResultView, CatalogTemplate, CountTemplate, PagerTemplate, MainContentTemplate, CurrentFilterTemplate, LoadingTemplate, gmaps, nGeohash) {
	'use strict';

	var DataCatalogView = Backbone.View.extend({

		el: "#Content",

		isSubView: false,
		filters: true, //Turn on/off the filters in this view

		//The default global models for searching
		searchModel: null,
		searchResults: null,
		statsModel: new StatsModel(),

		//Templates
		template: _.template(CatalogTemplate),
		statsTemplate: _.template(CountTemplate),
		pagerTemplate: _.template(PagerTemplate),
		mainContentTemplate: _.template(MainContentTemplate),
		currentFilterTemplate: _.template(CurrentFilterTemplate),
		loadingTemplate: _.template(LoadingTemplate),
		metricStatTemplate:  _.template( "<span class='metric-icon'> <i class='icon" +
                            " <%=metricIcon%>'></i> </span>" +
                            "<span class='metric-value'> <i class='icon metric-icon'>" +
                            "</i> </span>"),

		//Search mode
		mode: "map",

		//Map settings and storage
		map: null,
		ready: false,
		allowSearch: true,
		hasZoomed: false,
		hasDragged: false,
		markers: {},
		tiles: [],
		tileCounts: [],
		//Contains the geohashes for all the markers on the map (if turned on in the Map model)
		markerGeohashes: [],
		//Contains all the info windows for all the markers on the map (if turned on in the Map model)
		markerInfoWindows: [],
		//Contains all the info windows for each document in the search result list - to display on hover
		tileInfoWindows: [],
		//Contains all the currently visible markers on the map
		resultMarkers: [],
		//The geohash value for each tile drawn on the map
		tileGeohashes: [],
		mapFilterToggle: ".toggle-map-filter",

		// Delegated events for creating new items, and clearing completed ones.
		events: {
							'click #results_prev' : 'prevpage',
							'click #results_next' : 'nextpage',
					 'click #results_prev_bottom' : 'prevpage',
					 'click #results_next_bottom' : 'nextpage',
	       			   		   'click .pagerLink' : 'navigateToPage',
							  'click .filter.btn' : 'updateTextFilters',
			 'keypress input[type="text"].filter' : 'triggerOnEnter',
			    'focus input[type="text"].filter' : 'getAutocompletes',
							  'change #sortOrder' : 'triggerSearch',
							   'change #min_year' : 'updateYearRange',
							   'change #max_year' : 'updateYearRange',
			                'click #publish_year' : 'updateYearRange',
			                   'click #data_year' : 'updateYearRange',
						   'click .remove-filter' : 'removeFilter',
			'click input[type="checkbox"].filter' : 'updateBooleanFilters',
							   'click #clear-all' : 'resetFilters',
					'click a.keyword-search-link' : 'additionalCriteria',
				   'click .remove-addtl-criteria' : 'removeAdditionalCriteria',
				   			 'click .collapse-me' : 'collapse',
 'click .filter-contain .expand-collapse-control' : 'toggleFilterCollapse',
	  						  'click #jumpUp' : 'jumpUp',
	  						  'click #resetTree' : 'resetTree',
				   			  'click #toggle-map' : 'toggleMapMode',
				   			  'click .toggle-map' : 'toggleMapMode',
				   			 'click .toggle-list' : 'toggleList',
				   	   "click .toggle-map-filter" : "toggleMapFilter",
				   		 'mouseover .open-marker' : 'showResultOnMap',
				   	      'mouseout .open-marker' : 'hideResultOnMap',
		      'mouseover .prevent-popover-runoff' : 'preventPopoverRunoff'
		},

		initialize: function(options){
			var view = this;

			//Get all the options and apply them to this view
			if(options){
				var optionKeys = Object.keys(options);
				_.each(optionKeys, function(key, i){
					view[key] = options[key];
				});
			}
		},

		// Render the main view and/or re-render subviews. Don't call .html() here
		// so we don't lose state, rather use .setElement(). Delegate rendering
		// and event handling to sub views
		render: function () {

			//Use the global models if there are no other models specified at time of render
			if((MetacatUI.appModel.get("searchHistory").length > 0) && (!this.searchModel || Object.keys(this.searchModel).length == 0)){
				this.searchModel = _.last(MetacatUI.appModel.get("searchHistory")).search.clone();
				MetacatUI.mapModel = _.last(MetacatUI.appModel.get("searchHistory")).map.clone();
			}
			else if((typeof MetacatUI.appSearchModel !== "undefined") && (!this.searchModel || Object.keys(this.searchModel).length == 0))
				this.searchModel = MetacatUI.appSearchModel;

		    if(((typeof this.searchResults === "undefined") || (!this.searchResults || Object.keys(this.searchResults).length == 0)) && (MetacatUI.appSearchResults && (Object.keys(MetacatUI.appSearchResults).length > 0)))
		    	this.searchResults = MetacatUI.appSearchResults;

			//Get the search mode - either "map" or "list"
			if((typeof this.mode === "undefined") || !this.mode){
				this.mode = MetacatUI.appModel.get("searchMode");
				if((typeof this.mode === "undefined") || !this.mode)
					this.mode = "map";

				MetacatUI.appModel.set("searchMode", this.mode);
			}
			if($(window).outerWidth() <= 600){
				this.mode = "list";
				MetacatUI.appModel.set("searchMode", "list");
				gmaps = null;
			}

			MetacatUI.appModel.set('headerType', 'default');
			$("body").addClass("DataCatalog");

			//Populate the search template with some model attributes
			var loadingHTML = this.loadingTemplate({
				msg: "Retrieving member nodes..."
			});

			var templateVars = {
					gmaps           : gmaps,
					mode		    : MetacatUI.appModel.get("searchMode"),
					useMapBounds    : this.searchModel.get("useGeohash"),
					username        : MetacatUI.appUserModel.get('username'),
					isMySearch      : (_.indexOf(this.searchModel.get("username"), MetacatUI.appUserModel.get("username")) > -1),
					loading         : loadingHTML,
					searchModelRef  : this.searchModel,
					dataSourceTitle : (MetacatUI.theme == "dataone") ? "Member Node" : "Data source"
				}
			var cel = this.template(_.extend(this.searchModel.toJSON(), templateVars));

			this.$el.html(cel);

			// Store some references to key views that we use repeatedly
			this.$resultsview = this.$('#results-view');
			this.$results = this.$('#results');

			//Update stats
			this.updateStats();

			//Render the Google Map
			this.renderMap();

			//Initialize the tooltips
			var tooltips = $(".tooltip-this");

			//Find the tooltips that are on filter labels - add a slight delay to those
			var groupedTooltips = _.groupBy(tooltips, function(t){
				return ((($(t).prop("tagName") == "LABEL") || ($(t).parent().prop("tagName") == "LABEL")) && ($(t).parents(".filter-container").length > 0))
			});
			var forFilterLabel = true,
				forOtherElements = false;

			$(groupedTooltips[forFilterLabel]).tooltip({ delay: {show: "800"}});
			$(groupedTooltips[forOtherElements]).tooltip();

			//Initialize all popover elements
			$('.popover-this').popover();

			//Initialize the resizeable content div
			$('#content').resizable({handles: "n,s,e,w"});

			//Collapse the filters
			this.toggleFilterCollapse();

			//Initialize the jQueryUI button checkboxes
			$( "#filter-year" ).buttonset();
			$( "#includes-files-buttonset" ).buttonset();

			//Iterate through each search model text attribute and show UI filter for each
			var categories = ['all', 'attribute', 'creator', 'id', 'taxon', 'spatial', 'additionalCriteria', 'annotation'];
			var thisTerm = null;

			for (var i=0; i<categories.length; i++){
				thisTerm = this.searchModel.get(categories[i]);

				if(thisTerm === undefined) break;

				for (var x=0; x<thisTerm.length; x++){
					this.showFilter(categories[i], thisTerm[x]);
				}
			}

			//List the Member Node filters
			var view = this;
			_.each(this.searchModel.get("dataSource"), function(source, i){
				view.showFilter("dataSource", source);
			});

			// the additional fields
			this.showAdditionalCriteria();

			// Add the custom query under the "Anything" filter
			if(this.searchModel.get('customQuery')){
				this.showFilter("all", this.searchModel.get('customQuery'));
			}

			// Register listeners; this is done here in render because the HTML
			// needs to be bound before the listenTo call can be made
			this.stopListening(this.searchResults);
			this.stopListening(this.searchModel);
			this.stopListening(MetacatUI.appModel);
			this.listenTo(this.searchResults, 'reset', this.cacheSearch);
			this.listenTo(this.searchResults, 'add', this.addOne);
			this.listenTo(this.searchResults, 'reset', this.addAll);
			this.listenTo(this.searchResults, 'reset', this.checkForProv);

			//List data sources
			this.listDataSources();
			this.listenTo(MetacatUI.nodeModel, 'change:members', this.listDataSources);

			// listen to the MetacatUI.appModel for the search trigger
			this.listenTo(MetacatUI.appModel, 'search', this.getResults);

			this.listenTo(MetacatUI.appUserModel, "change:loggedIn", this.triggerSearch);

			// and go to a certain page if we have it
			this.getResults();

			//Set a custom height on any elements that have the .auto-height class
			if($(".auto-height").length > 0){
				//Readjust the height whenever the window is resized
				$(window).resize(this.setAutoHeight);
				$(".auto-height-member").resize(this.setAutoHeight);
			}

			if (MetacatUI.appModel.get("bioportalAPIKey")) {
				this.setUpTree();
			}

			return this;
		},


		// Linked Data Object for appending the jsonld into the browser DOM
		getLinkedData: function () {
				// Find the MN info from the CN Node list
				var  members = MetacatUI.nodeModel.get("members")
				for (var i = 0; i < members.length; i++) {
					if(members[i].identifier == MetacatUI.nodeModel.get("currentMemberNode")) {
						var nodeModelObject = members[i];
					}
				}

				// JSON Linked Data Object
				let elJSON = {
					"@context": {
						"@vocab": "http://schema.org/"
					},
					"@type": "DataCatalog",
				};
				if(nodeModelObject) {
					// "keywords": "",
					// "provider": "",
					let conditionalData = {
						"description": nodeModelObject.description,
						"identifier": nodeModelObject.identifier,
						"image": nodeModelObject.logo,
						"name": nodeModelObject.name,
						"url": nodeModelObject.url
					}
					$.extend(elJSON,conditionalData)
				}


				// Check if the jsonld already exists from the previous data view
				// If not create a new script tag and append otherwise replace the text for the script
				if (!document.getElementById('jsonld')) {
						var el = document.createElement('script');
						el.type = 'application/ld+json';
						el.id = 'jsonld';
						el.text = JSON.stringify(elJSON);
						document.querySelector('head').appendChild(el);
				}
				else {
						var script = document.getElementById('jsonld');
						script.text = JSON.stringify(elJSON);
				}
			return;
		},

		setUpTree : function() {
			this.$el.data("data-catalog-view", this);

			var tree = $("#bioportal-tree").NCBOTree({
				  apikey: MetacatUI.appModel.get("bioportalAPIKey"),
				  ontology: "ECSO",
				  width: "400",
				  startingRoot: "http://ecoinformatics.org/oboe/oboe.1.2/oboe-core.owl#MeasurementType"
				});

			// make a container for the tree and nav buttons
			var contentPlus = $("<div></div>");
			$(contentPlus).append('<button class="icon icon-level-up tooltip-this" id="jumpUp" data-trigger="hover" data-title="Go up to parent" data-placement="top"></button>');
			$(contentPlus).append('<button class="icon icon-undo tooltip-this" id="resetTree" data-trigger="hover" data-title="Reset tree" data-placement="top"></button>');
			$(contentPlus).append(tree);

			$("[data-category='annotation'] .expand-collapse-control").popover({
				html: true,
				placement: "bottom",
				trigger:"manual",
				content: contentPlus,
				container: "#bioportal-popover"
			}).on("click", function(){
				if($($(this).data().popover.options.content).is(":visible")){
					//Detach the tree from the popover so it doesn't get removed by Bootstrap
					$(this).data().popover.options.content.detach();
					//Hide the popover
					$(this).popover("hide");
				}
				else{
					//Get the popover content
					var content = $(this).data().popoverContent || $(this).data().popover.options.content.detach();
					//Cache it
					$(this).data({ popoverContent: content });
					//Show the popover
					$(this).popover("show");
					//Insert the tree into the popover content
					$(this).data().popover.options.content = content;

					// ensure tooltips are activated
			    	$(".tooltip-this").tooltip();

				}
			});

			// set up the listener to jump to search results
			tree.on("afterSelect", this.selectConcept);
			tree.on("afterJumpToClass", this.afterJumpToClass);
			tree.on("afterExpand", this.afterExpand);

		},

		selectConcept : function(event, classId, prefLabel, selectedNode) {

			// Get the concept info
			var uri = classId;
			var label = prefLabel;
			var description = "";

			var item = {};
			item.value = uri;
			item.label = label;
			item.filterLabel = label;
			item.desc = "";

			// set the text field
			$('#annotation_input').val(item.value);

			// add to the filter immediately
			var view = $("#Content").data("data-catalog-view");
			view.updateTextFilters(event, item);

			// hide the hover
			$(selectedNode).trigger("mouseout");

			// hide the popover
			var annotationFilterEl = $("[data-category='annotation'] .expand-collapse-control");
			annotationFilterEl.trigger("click");

			// reset the tree for next search
			var tree = annotationFilterEl.data().popoverContent.find("#bioportal-tree").data("NCBOTree");
			var options = tree.options();
			$.extend(options, {startingRoot: "http://ecoinformatics.org/oboe/oboe.1.2/oboe-core.owl#MeasurementType"});
			tree.changeOntology("ECSO");

			// prevent default action
			return false;

		},

		afterExpand : function() {
			// ensure tooltips are activated
	    	$(".tooltip-this").tooltip();
		},

		afterJumpToClass : function(event, classId) {

			// re-root the tree at this concept
			var tree = $("[data-category='annotation'] .expand-collapse-control").data().popoverContent.find("#bioportal-tree").data("NCBOTree");
			var options = tree.options();
			$.extend(options, {startingRoot: classId});

			// force a re-render
			tree.init();

			// ensure the tooltips are activated
			$(".tooltip-this").tooltip();

		},

		jumpUp : function() {

			// re-root the tree at the parent concept of the root
			var tree = $("[data-category='annotation'] .expand-collapse-control").data().popoverContent.find("#bioportal-tree").data("NCBOTree");
			var options = tree.options();
			var startingRoot = options.startingRoot;

			if (startingRoot == "http://ecoinformatics.org/oboe/oboe.1.2/oboe-core.owl#MeasurementType") {
				return false;
			}

			var parentId = $("a[data-id='"+ encodeURIComponent(startingRoot) + "'").attr("data-subclassof");

			// re-root
			$.extend(options, {startingRoot: parentId});

			// force a re-render
			tree.init();

			// ensure the tooltips are activated
			$(".tooltip-this").tooltip();

			return false;

		},

		resetTree : function() {

			// re-root the tree at the original concept
			var tree = $("[data-category='annotation'] .expand-collapse-control").data().popoverContent.find("#bioportal-tree").data("NCBOTree");
			var options = tree.options();
			var startingRoot = "http://ecoinformatics.org/oboe/oboe.1.2/oboe-core.owl#MeasurementType";

			// re-root
			$.extend(options, {startingRoot: startingRoot});

			// force a re-render
			tree.init();

			// ensure the tooltips are activated
			$(".tooltip-this").tooltip();

			return false;

		},

		/*
		 * Sets the height on elements in the main content area to fill up the entire area minus header and footer
		 */
		setAutoHeight: function(){
			//If we are in list mode, don't determine the height of any elements because we are not "full screen"
			if(MetacatUI.appModel.get("searchMode") == "list"){
				MetacatUI.appView.$(".auto-height").height("auto");
				return;
			}

			//Get the heights of the header, navbar, and footer
			var otherHeight = 0;
			$(".auto-height-member").each(function(i, el){
				if($(el).css("display") != "none")
					otherHeight += $(el).outerHeight(true);
			});

			//Get the remaining height left based on the window size
			var remainingHeight = $(window).outerHeight(true) - otherHeight;
			if(remainingHeight < 0) remainingHeight = $(window).outerHeight(true) || 300;
			else if(remainingHeight <= 120) remainingHeight = ($(window).outerHeight(true) - remainingHeight) || 300;

			//Adjust all elements with the .auto-height class
			$(".auto-height").height(remainingHeight);

			if(($("#map-container.auto-height").length > 0) && ($("#map-canvas").length > 0)){
				var otherHeight = 0;
				$("#map-container.auto-height").children().each(function(i, el){
					if($(el).attr("id") != "map-canvas")
						otherHeight += $(el).outerHeight(true);
				});
				var newMapHeight = remainingHeight - otherHeight;
				if(newMapHeight > 100)
					$("#map-canvas").height(remainingHeight - otherHeight);
			}

			//Trigger a resize for the map so that all of the map background images are loaded
			if(gmaps && MetacatUI.mapModel.get("map"))
				google.maps.event.trigger(MetacatUI.mapModel.get("map"), 'resize');
		},

		/**
		 * ==================================================================================================
		 * 										PERFORMING SEARCH
		 * ==================================================================================================
		**/
		triggerSearch: function() {

			//Set the sort order
			var sortOrder = $("#sortOrder").val();
			if(sortOrder)
				this.searchModel.set('sortOrder', sortOrder);

			//Trigger a search to load the results
			MetacatUI.appModel.trigger('search');

			// make sure the browser knows where we are
			var route = Backbone.history.fragment;
			if (route.indexOf("data") < 0) {
				MetacatUI.uiRouter.navigate("data");
			} else {
				MetacatUI.uiRouter.navigate(route);
			}

			// ...but don't want to follow links
			return false;
		},

		triggerOnEnter: function(e) {
			if (e.keyCode != 13) return;

			//Update the filters
			this.updateTextFilters(e);
		},


		/**
		 * getResults gets all the current search filters from the searchModel, creates a Solr query, and runs that query.
		 */
		getResults: function (page) {

			//Set the sort order based on user choice
			var sortOrder = this.searchModel.get('sortOrder');
			this.searchResults.setSort(sortOrder);

			//Specify which fields to retrieve
			var fields = "id,seriesId,title,origin,pubDate,dateUploaded,abstract,resourceMap,beginDate,endDate,read_count_i,geohash_9,datasource,isPublic,documents";
			if(gmaps){
				fields += ",northBoundCoord,southBoundCoord,eastBoundCoord,westBoundCoord";
			}
			this.searchResults.setfields(fields);

			//Get the query
			var query = this.searchModel.getQuery();

			//Specify which facets to retrieve
			if(gmaps && this.map){ //If we have Google Maps enabled
				var geohashLevel = "geohash_" + MetacatUI.mapModel.determineGeohashLevel(this.map.zoom);
				this.searchResults.facet.push(geohashLevel);
			}

			//Run the query
			this.searchResults.setQuery(query);

			//Get the page number
			if(this.isSubView)
				var page = 0;
			else{
				var page = MetacatUI.appModel.get("page");
				if (page == null) {
					page = 0;
				}
			}
			this.searchResults.start = page * this.searchResults.rows;

			//Show or hide the reset filters button
			if(this.searchModel.filterCount() > 0){
				this.showClearButton();
			}
			else{
				this.hideClearButton();
			}

			// go to the page
			this.showPage(page);

			// don't want to follow links
			return false;
		},

		/*
		 * After the search results have been returned, check if any of them are derived data or have derivations
		 */
		checkForProv: function(){

			var maps = [],
				hasSources = [],
				hasDerivations = [],
				mainSearchResults = this.searchResults;

			//Get a list of all the resource map IDs from the SolrResults collection
			maps = this.searchResults.pluck("resourceMap");
			maps = _.compact(_.flatten(maps));

			//Create a new Search model with a search that finds all members of these packages/resource maps
			var provSearchModel   = new SearchModel({
				formatType: [{
					value: "DATA",
					label: "data",
					description: null
				}],
				exclude: [],
				resourceMap: maps
			});

			//Create a new Solr Results model to store the results of this supplemental query
			var provSearchResults = new SearchResults(null, {
				query: provSearchModel.getQuery(),
				searchLogs: false,
				rows: 150,
				fields: provSearchModel.getProvFlList() + ",id,resourceMap"
			});

			//Trigger a search on that Solr Results model
			this.listenTo(provSearchResults, "reset", function(results){
				if(results.models.length == 0) return;

				//See if any of the results have a value for a prov field
				results.forEach(function(result){
					if((!result.getSources().length) || (!result.getDerivations())) return;
					_.each(result.get("resourceMap"), function(rMapID){
						if(_.contains(maps, rMapID)){
							var match = mainSearchResults.filter(function(mainSearchResult){ return _.contains(mainSearchResult.get("resourceMap"), rMapID) });
							if(match && (result.getSources().length > 0))     hasSources.push(match[0].get("id"));
							if(match && (result.getDerivations().length > 0)) hasDerivations.push(match[0].get("id"));
						}
					});
				});

				//Filter out the duplicates
				hasSources     = _.uniq(hasSources);
				hasDerivations = _.uniq(hasDerivations);

				//If they do, find their corresponding result row here and add the prov icon (or just change the class to active)
				_.each(hasSources, function(metadataID){
					var metadataDoc = mainSearchResults.findWhere({id: metadataID});
					if(metadataDoc)
						metadataDoc.set("prov_hasSources", true);
				});
				_.each(hasDerivations, function(metadataID){
					var metadataDoc = mainSearchResults.findWhere({id: metadataID});
					if(metadataDoc)
						metadataDoc.set("prov_hasDerivations", true);
				});
			});
			provSearchResults.toPage(0);
		},

		cacheSearch: function(){
			MetacatUI.appModel.get("searchHistory").push({
				search:  this.searchModel.clone(),
				map:     MetacatUI.mapModel.clone()
			});
			MetacatUI.appModel.trigger("change:searchHistory");
		},

		/**
		 * ==================================================================================================
		 * 											FILTERS
		 * ==================================================================================================
		**/
		updateCheckboxFilter : function(e, category, value){
			if(!this.filters) return;

			var checkbox = e.target;
			var checked = $(checkbox).prop("checked");

			if(typeof category == "undefined") var category = $(checkbox).attr('data-category');
			if(typeof value == "undefined")    var value = $(checkbox).attr("value");

			//If the user just unchecked the box, then remove this filter
			if(!checked){
				this.searchModel.removeFromModel(category, value);
				this.hideFilter(category, value);
			}
			//If the user just checked the box, then add this filter
			else{
				var currentValue = this.searchModel.get(category);

				//Get the description
				var desc = $(checkbox).attr("data-description") || $(checkbox).attr("title");
				if(typeof desc == "undefined" || !desc) desc = "";
				//Get the label
				var labl = $(checkbox).attr("data-label");
				if(typeof labl == "undefined" || !labl) labl = "";

				//Make the filter object
				var filter = {
						description: desc,
						label: labl,
						value: value
				}

				//If this filter category is an array, add this value to the array
				if(Array.isArray(currentValue)){
					currentValue.push(filter);
					this.searchModel.set(category, currentValue);
					this.searchModel.trigger("change:" + category);
				}
				else{
					//If it isn't an array, then just update the model with a simple value
					this.searchModel.set(category, filter);
				}

				//Show the filter element
				this.showFilter(category, value, true, labl);

				//Show the reset button
				this.showClearButton();
			}

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();
		},

		updateBooleanFilters : function(e){
			if(!this.filters) return;

			//Get the category
			var checkbox = e.target;
			var category = $(checkbox).attr('data-category');
			var currentValue = this.searchModel.get(category);

			//If this filter is not available, exit this function
			if(!this.searchModel.filterIsAvailable(category)) return false;
			if((category == "pubYear") || (category == "dataYear")) return;

			//If the checkbox has a value, then update as a string value not boolean
			var value = $(checkbox).attr("value");
			if(value){
				this.updateCheckboxFilter(e, category, value);
				return;
			}
			else value = $(checkbox).prop('checked');

			this.$(".ui-buttonset").buttonset("refresh");

			this.searchModel.set(category, value);

			//Add the filter to the UI
			if(value)
				this.showFilter(category, "", true);
			//Remove the filter from the UI
			else{
				value = "";
				this.hideFilter(category, value);
			}

			//Show the reset button
			this.showClearButton();

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();

			//Send this event to Google Analytics
			if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
				ga("send", "event", "search", "filter, " + category, value);
		},

		//Update the UI year slider and input values
		//Also update the model
		updateYearRange : function(e) {
			if(!this.filters) return;

			var viewRef    = this,
				userAction = !(typeof e === "undefined"),
				model      = this.searchModel,
				pubYearChecked  = $('#publish_year').prop('checked'),
				dataYearChecked = $('#data_year').prop('checked');


			//If the year range slider has not been created yet
			if(!userAction && !$("#year-range").hasClass("ui-slider")){
				//jQueryUI slider
				$('#year-range').slider({
				    range: true,
				    disabled: false,
				    min: this.searchModel.defaults().yearMin,	//sets the minimum on the UI slider on initialization
				    max: this.searchModel.defaults().yearMax, 	//sets the maximum on the UI slider on initialization
				    values: [ this.searchModel.get('yearMin'), this.searchModel.get('yearMax') ], //where the left and right slider handles are
				    stop: function( event, ui ) {

				      // When the slider is changed, update the input values
				      $('#min_year').val(ui.values[0]);
				      $('#max_year').val(ui.values[1]);

				      //Also update the search model
				      model.set('yearMin', ui.values[0]);
				      model.set('yearMax', ui.values[1]);

					  // If neither the publish year or data coverage year are checked
					  if(!$('#publish_year').prop('checked') && !$('#data_year').prop('checked')){

						  //We want to check the data coverage year on the user's behalf
						  $('#data_year').prop('checked', 'true');

						  //And update the search model
						  model.set('dataYear', true);

						  //refresh the UI buttonset so it appears as checked/unchecked
						  $("#filter-year").buttonset("refresh");
					  }

				      //Add the filter elements
					  if($('#publish_year').prop('checked'))
						  viewRef.showFilter($('#publish_year').attr("data-category"), true, false, ui.values[0] + " to " + ui.values[1], {replace: true});
					  if($('#data_year').prop('checked'))
						  viewRef.showFilter($('#data_year').attr("data-category"), true, false, ui.values[0] + " to " + ui.values[1], {replace: true});

					  //Route to page 1
				      viewRef.updatePageNumber(0);

					 //Trigger a new search
					 viewRef.triggerSearch();
				    }
				  });

				//Get the minimum and maximum years of this current search and use those as the min and max values in the slider
				this.statsModel.set("query", this.searchModel.getQuery());
				this.listenTo(this.statsModel, "change:firstBeginDate", function(){
					if(this.statsModel.get("firstBeginDate") == 0 || !this.statsModel.get("firstBeginDate")){
						$('#year-range').slider({ min: model.defaults().yearMin });
						return;
					}
					var year = new Date.fromISO(this.statsModel.get("firstBeginDate")).getUTCFullYear();
					if(typeof year !== "undefined"){
						$('#min_year').val(year);
						$('#year-range').slider({
							values: [year, $('#max_year').val()]
						});

						//If the slider min is still at the default value, then update with the min value found at this search
						if($("#year-range").slider("option", "min") == model.defaults().yearMin)
							$('#year-range').slider({ min: year });

						//Add the filter elements if this is set
						if(viewRef.searchModel.get("pubYear"))
							viewRef.showFilter("pubYear", true, false, $('#min_year').val() + " to " + $('#max_year').val(), {replace:true});
						if(viewRef.searchModel.get("dataYear"))
							viewRef.showFilter("dataYear", true, false, $('#min_year').val() + " to " + $('#max_year').val(), {replace:true});
					}
				});
				//Only when the first begin date is retrieved, set the slider min and max values
				this.listenTo(this.statsModel, "change:lastEndDate", function(){
					if(this.statsModel.get("lastEndDate") == 0 || !this.statsModel.get("lastEndDate")){
						$('#year-range').slider({ max: model.defaults().yearMax });
						return;
					}
					var year = new Date.fromISO(this.statsModel.get("lastEndDate")).getUTCFullYear();
					if(typeof year !== "undefined"){
						$('#max_year').val(year);
						$('#year-range').slider({
							values: [$('#min_year').val(), year]
						});

						//If the slider max is still at the default value, then update with the max value found at this search
						if($("#year-range").slider("option", "max") == model.defaults().yearMax)
							$('#year-range').slider({ max: year });

						//Add the filter elements if this is set
						if(viewRef.searchModel.get("pubYear"))
							viewRef.showFilter("pubYear", true, false, $('#min_year').val() + " to " + $('#max_year').val(), {replace:true});
						if(viewRef.searchModel.get("dataYear"))
							viewRef.showFilter("dataYear", true, false, $('#min_year').val() + " to " + $('#max_year').val(), {replace:true});
					}
				});
				this.statsModel.getFirstBeginDate();
				this.statsModel.getLastEndDate();
			}
			//If the year slider has been created and the user initiated a new search using other filters
			else if(!userAction && (!this.searchModel.get("dataYear")) && (!this.searchModel.get("pubYear"))){
				//Reset the min and max year based on this search
				this.statsModel.set("query", this.searchModel.getQuery());
				this.statsModel.getFirstBeginDate();
				this.statsModel.getLastEndDate();
			}
			// If either of the year type selectors is what brought us here, then determine whether the user
			// is completely removing both (reset both year filters) or just one (remove just that one filter)
			else if(userAction){
				//When both year types were unchecked, assume user wants to reset the year filter
				if((($(e.target).attr('id') == "data_year") || ($(e.target).attr('id') == "publish_year")) && (!pubYearChecked && !dataYearChecked)){
					//Reset the search model
					this.searchModel.set('yearMin', this.searchModel.defaults().yearMin);
					this.searchModel.set('yearMax', this.searchModel.defaults().yearMax);
					this.searchModel.set('dataYear', false);
					this.searchModel.set('pubYear', false);

					//Reset the min and max year based on this search
					this.statsModel.set("query", this.searchModel.getQuery());
					this.statsModel.getFirstBeginDate();
					this.statsModel.getLastEndDate();

					//Slide the handles back to the defaults
					$('#year-range').slider("values", [this.searchModel.defaults().yearMin, this.searchModel.defaults().yearMax]);

					//Hide the filters
					this.hideFilter("dataYear");
					this.hideFilter("pubYear");
				}
				//If either of the year inputs have changed or if just one of the year types were unchecked
				else{
					var minVal = $('#min_year').val();
					var maxVal = $('#max_year').val();

					//Update the search model to match what is in the text inputs
				    this.searchModel.set('yearMin', minVal);
				    this.searchModel.set('yearMax', maxVal);
				    this.searchModel.set('dataYear', dataYearChecked);
				    this.searchModel.set('pubYear',  pubYearChecked);

				    // If neither the publish year or data coverage year are checked
					if(!pubYearChecked && !dataYearChecked){

					  //We want to check the data coverage year on the user's behalf
					  $('#data_year').prop('checked', 'true');

					  //And update the search model
					  model.set('dataYear', true);

					  //Add the filter elements
					  this.showFilter($('#data_year').attr("data-category"), true, true, minVal + " to " + maxVal, {replace: true});

					  //refresh the UI buttonset so it appears as checked/unchecked
					  $("#filter-year").buttonset("refresh");

					 //Send this event to Google Analytics
				   	 if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
						ga("send", "event", "search", "filter, Data Year", minVal + " to " + maxVal);

					}
					else{
						//Add the filter elements
						if(pubYearChecked){
							this.showFilter($('#publish_year').attr("data-category"), true, true, minVal + " to " + maxVal, {replace: true});

							//Send this event to Google Analytics
							if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
								ga("send", "event", "search", "filter, Publication Year", minVal + " to " + maxVal);
						}
						else
							this.hideFilter($('#publish_year').attr("data-category"), true);

						if(dataYearChecked){
							this.showFilter($('#data_year').attr("data-category"), true, true, minVal + " to " + maxVal, {replace: true});

							//Send this event to Google Analytics
							if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
								ga("send", "event", "search", "filter, Data Year", minVal + " to " + maxVal);
						}
						else
							this.hideFilter($('#data_year').attr("data-category"), true);
					}
				}

				//Route to page 1
			    this.updatePageNumber(0);

			    //Trigger a new search
				this.triggerSearch();
			}
		},

		updateTextFilters : function(e, item){
			if(!this.filters) return;

			//Get the search/filter category
			var category = $(e.target).attr('data-category');

			//Try the parent elements if not found
			if(!category){
				var parents = $(e.target).parents().each(function(){
					category = $(this).attr('data-category');
					if (category){
						return false;
					}
				});
			}

			if(!category){ return false; }

			//Get the input element
			var input = this.$el.find('#' + category + '_input');

			//Get the value of the associated input
			var term 		= (!item || !item.value) ? input.val() : item.value;
			var label 		= (!item || !item.filterLabel) ? null : item.filterLabel;
			var filterDesc  = (!item || !item.desc) ? null : item.desc;

			//Check that something was actually entered
			if((term == "") || (term == " ")){
				return false;
			}

			//Take out quotes since all search multi-word terms are wrapped in quotes anyway
			while(term.startsWith('"') || term.startsWith("'")){
				term = term.substr(1);
			}
			while(term.startsWith("%22")){
				term = term.substr(3);
			}
			while(term.endsWith('"') || term.endsWith("'")){
				term = term.substr(0, term.length-1);
			}
			while(term.startsWith("%22")){
				term = term.substr(0, term.length-3);
			}

			//Close the autocomplete box
			if (e.type == "hoverautocompleteselect") {
				$(input).hoverAutocomplete("close");
			}
			else if($(input).data('ui-autocomplete') != undefined){
				//If the autocomplete has been initialized, then close it
				$(input).autocomplete("close");
			}

			//Get the current searchModel array for this category
			var filtersArray = _.clone(this.searchModel.get(category));

			if(typeof filtersArray == "undefined"){
				console.error("The filter category '" + category + "' does not exist in the Search model. Not sending this search term.");
				return false;
			}

			//Check if this entry is a duplicate
			var duplicate = (function(){
				for(var i=0; i < filtersArray.length; i++){
					if(filtersArray[i].value === term){ return true; }
				}
			})();

			if(duplicate){
				//Display a quick message
				if($('#duplicate-' + category + '-alert').length <= 0){
					$('#current-' + category + '-filters').prepend(
							'<div class="alert alert-block" id="duplicate-' + category + '-alert">' +
							'You are already using that filter' +
							'</div>'
					);

					$('#duplicate-' + category + '-alert').delay(2000).fadeOut(500, function(){
						this.remove();
					});
				}

				return false;
			}

			//Add the new entry to the array of current filters
			var filter = {
					value: term,
					filterLabel: label,
					label: label,
					description: filterDesc
				};
			filtersArray.push(filter);

			//Replace the current array with the new one in the search model
			this.searchModel.set(category, filtersArray);

			//Show the UI filter
			this.showFilter(category, filter, false, label);

			//Clear the input
			input.val('');

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();

			//Send this event to Google Analytics
			if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
				ga("send", "event", "search", "filter, " + category, term);
		},

		//Removes a specific filter term from the searchModel
		removeFilter : function(e){
			//Get the parent element that stores the filter term
			var filterNode = $(e.target).parent();

			//Find this filter's category and value
			var category = filterNode.attr("data-category") || filterNode.parent().attr('data-category'),
				value    = $(filterNode).attr('data-term');

			//Remove this filter from the searchModel
			this.searchModel.removeFromModel(category, value);

			//Hide the filter from the UI
			this.hideFilter(category, value);

			//Find if there is an associated checkbox with this filter
			var checkbox = $("input[type='checkbox'][data-category='" + category + "']");
			if(checkbox.length > 0){
				var checkboxWithValue = checkbox.find("[value='" + value + "']");
				if(checkboxWithValue.length > 0)
					checkboxWithValue.prop("checked", false);
				else
					checkbox.prop("checked", false);

				this.$(".ui-buttonset").buttonset("refresh");
			}

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();

		},

		//Clear all the currently applied filters
		resetFilters : function(){
			var viewRef = this;

			this.allowSearch = true;

			//Hide all the filters in the UI
			$.each(this.$(".current-filter"), function(){ viewRef.hideEl(this); });

			//Hide the clear button
			this.hideClearButton();

			//Then reset the model
			this.searchModel.clear();
			MetacatUI.mapModel.clear();

			//Reset the year slider handles
			$("#year-range").slider("values", [this.searchModel.get('yearMin'), this.searchModel.get('yearMax')])
			//and the year inputs
			$("#min_year").val(this.searchModel.get('yearMin'));
			$("#max_year").val(this.searchModel.get('yearMax'));

			//Reset the checkboxes
			$("#includes_data").prop("checked", this.searchModel.get("documents"));
			$("#data_year").prop("checked",     this.searchModel.get("dataYear"));
			$("#publish_year").prop("checked",  this.searchModel.get("pubYear"));
			this.listDataSources();
			$(".ui-buttonset").buttonset("refresh");

			//Zoom out the Google Map
			this.resetMap();
			this.renderMap();

			// reset any filter links
			this.showAdditionalCriteria();

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();
		},

		hideEl: function(element){
			//Fade out and remove the element
			$(element).fadeOut("slow", function(){
				$(element).remove();
			});
		},

		//Removes a specified filter node from the DOM
		hideFilter: function(category, value){
			if(!this.filters) return;

			if(typeof value === "undefined")
				var filterNode = this.$(".current-filters[data-category='" + category + "']").children(".current-filter");
			else
				var filterNode = this.$(".current-filters[data-category='" + category + "']").children("[data-term='" + value + "']");

			//Try finding it a different way
			if(!filterNode || !filterNode.length)
				filterNode = this.$(".current-filter[data-category='" + category + "']");

			//Remove the filter node from the DOM
			this.hideEl(filterNode);
		},

		//Adds a specified filter node to the DOM
		showFilter: function(category, term, checkForDuplicates, label, options){
			if(!this.filters) return;

			var viewRef = this;

			if(typeof term === "undefined") return false;

			//Get the element to add the UI filter node to
			//The pattern is #current-<category>-filters
			var filterContainer = this.$el.find('#current-' + category + '-filters');

			//Allow the option to only display this exact filter category and term once to the DOM
			//Helpful when adding a filter that is not stored in the search model (for display only)
			if (checkForDuplicates){
				var duplicate = false;

				//Get the current terms from the DOM and check against the new term
				filterContainer.children().each( function(){
					if($(this).attr('data-term') == term){
						duplicate = true;
					}
				});

				//If there is a duplicate, exit without adding it
				if(duplicate){ return; }
			}

			var	value = null,
				desc  = null;

			//See if this filter is an object and extract the filter attributes
			if(typeof term === "object"){
				if (typeof  term.description !== "undefined") {
					desc = term.description;
				}
				if (typeof term.filterLabel !== "undefined") {
					label = term.filterLabel;
				} else if ((typeof term.label !== "undefined") && (term.label)) {
					label = term.label;
				} else {
					label = null;
				}
				if (typeof  term.value !== "undefined") {
					value = term.value;
				}
			}
			else{
				value = term;

				//Find the filter label
				if((typeof label === "undefined") || !label) {

					//Use the filter value for the label, sans any leading # character
					if (value.indexOf("#") > 0) {
						label = value.substring(value.indexOf("#"));
					}
				}

				desc = label;
			}

			var categoryLabel = this.searchModel.fieldLabels[category];
			if((typeof categoryLabel === "undefined")  && (category == "additionalCriteria")) categoryLabel = "";
			if(typeof categoryLabel === "undefined") categoryLabel = category;

			//Add a filter node to the DOM
			var filterEl = viewRef.currentFilterTemplate({
				category: categoryLabel,
				value: value,
				label: label,
				description: desc
				}
			);

			//Add the filter to the page - either replace or tack on
			if(options && options.replace){
				var currentFilter = filterContainer.find(".current-filter");
				if(currentFilter.length > 0)
					currentFilter.replaceWith(filterEl);
				else
					filterContainer.prepend(filterEl);
			}
			else
				filterContainer.prepend(filterEl);

			//Tooltips and Popovers
			$(filterEl).tooltip({ delay: { show: 800 }});

			return;
		},

		/*
		 * Get the member node list from the model and list the members in the filter list
		 */
		listDataSources: function(){
			if(!this.filters) return;

			if(MetacatUI.nodeModel.get("members").length < 1) return;

			//Get the member nodes
			var members = _.sortBy(MetacatUI.nodeModel.get("members"), function(m){
					if(m.name)
						return m.name.toLowerCase();
					else
						return "";
				});
			var filteredMembers = _.reject(members, function(m){ return m.status != "operational"  });

			//Get the current search filters for data source
			var currentFilters = this.searchModel.get("dataSource");

			//Create an HTML list
			var listMax = 4,
				numHidden = filteredMembers.length - listMax,
				list = $(document.createElement("ul")).addClass("checkbox-list");

			//Add a checkbox and label for each member node in the node model
			_.each(filteredMembers, function(member, i){
				var listItem = document.createElement("li"),
					input = document.createElement("input"),
					label = document.createElement("label");

				//If this member node is already a data source filter, then the checkbox is checked
				var checked = _.findWhere(currentFilters, {value: member.identifier}) ? true : false;

					//Create a textual label for this data source
					$(label).addClass("ellipsis")
							.attr("for", member.identifier)
							.html(member.name)
							.prepend($(document.createElement("i")).addClass("icon icon-check"), $(document.createElement("i")).addClass("icon icon-check-empty"));

					//Create a checkbox for this data source
					$(input).addClass("filter")
							.attr("type", "checkbox")
							.attr("data-category", "dataSource")
							.attr("id", member.identifier)
							.attr("name", "dataSource")
							.attr("value", member.identifier)
							.attr("data-label", member.name)
							.attr("data-description", member.description);

					//Add tooltips to the label element
					$(label).tooltip({
						placement: "top",
						delay: {"show" : 900},
						trigger: "hover",
						viewport: "#sidebar",
						title: member.description
					});

					//If this data source is already selected as a filter (from the search model), then check the checkbox
					if(checked) $(input).prop("checked", "checked");

					//Collapse some of the checkboxes and labels after a certain amount
					if(i > (listMax - 1)){
						$(listItem).addClass("hidden");
					}

					//Insert a "More" link after a certain amount to enable users to expand the list
					if(i == listMax){
						var moreLink = document.createElement("a");
						$(moreLink).html("Show " + numHidden + " more")
								   .addClass("more-link pointer toggle-list")
								   .append($(document.createElement("i")).addClass("icon icon-expand-alt"));
						$(list).append(moreLink);
					}

					//Add this checkbox and laebl to the list
					$(listItem).append(input).append(label);
					$(list).append(listItem);
			});

			if(numHidden > 0){
				var lessLink = document.createElement("a");
				$(lessLink).html("Collapse member nodes")
				   		   .addClass("less-link toggle-list pointer hidden")
				   		   .append($(document.createElement("i")).addClass("icon icon-collapse-alt"));

				$(list).append(lessLink);
			}

			//Add the list of checkboxes to the placeholder
			var container = $('.member-nodes-placeholder');
			$(container).html(list);
			$(".tooltip-this").tooltip();
			$(list).buttonset();
		},

		resetDataSourceList: function(){
			if(!this.filters) return;

			//Reset the Member Nodes checkboxes
			var mnFilterContainer = $("#member-nodes-container"),
				defaultMNs = this.searchModel.get("dataSource");

			//Make sure the member node filter exists
			if(!mnFilterContainer || mnFilterContainer.length == 0) return false;
			if((typeof defaultMNs === "undefined") || !defaultMNs) return false;

			//Reset each member node checkbox
			var boxes = $(mnFilterContainer).find(".filter").prop("checked", false);

			//Check the member node checkboxes that are defaults in the search model
			_.each(defaultMNs, function(member, i){
				var value = null;

				//Allow for string search model filter values and object filter values
				if((typeof member !== "object") && member) value = member;
				else if((typeof member.value === "undefined") || !member.value) value = "";
				else value = member.value;

				$(mnFilterContainer).find("checkbox[value='" + value + "']").prop("checked", true);
			});

			this.$(".ui-buttonset").buttonset("refresh");

			return true;
		},

		toggleList: function(e){
			if(!this.filters) return;

			var link = e.target,
				controls = $(link).parents("ul").find(".toggle-list"),
				list = $(link).parents("ul"),
				isHidden = !(list.find(".more-link").is(".hidden"));

			//Hide/Show the list
			if(isHidden)
				list.children("li").slideDown();
			else
				list.children("li.hidden").slideUp();

			//Hide/Show the control links
			controls.toggleClass("hidden");
		},

		// highlights anything additional that has been selected
		showAdditionalCriteria: function() {
			var model = this.searchModel;

			// style the selection
			$(".keyword-search-link").each(function(index, targetNode){
				//Neutralize all keyword search links by 'deactivating'
				$(targetNode).removeClass("active");
				//Do this for the parent node as well for template flexibility
				$(targetNode).parent().removeClass("active");

				var dataCategory = $(targetNode).attr("data-category");
				var dataTerm = $(targetNode).attr("data-term");
				var terms = model.get(dataCategory);
				if (_.contains(terms, dataTerm)) {
					//Add the active class for styling
					$(targetNode).addClass("active");

					//Add the class to the parent node as well for template flexibility
					$(targetNode).parent().addClass("active");
				}

			});

		},

		// add additional criteria to the search model based on link click
		additionalCriteria: function(e){
			// Get the clicked node
			var targetNode = $(e.target);

			//If this additional criteria is already applied, remove it
			if(targetNode.hasClass('active')){
				this.removeAdditionalCriteria(e);
				return false;
			}

			// Get the filter criteria
			var term = targetNode.attr('data-term');

			// Find this element's category in the data-category attribute
			var category = targetNode.attr('data-category');

			// style the selection
			$(".keyword-search-link").removeClass("active");
			$(".keyword-search-link").parent().removeClass("active");
			targetNode.addClass("active");
			targetNode.parent().addClass("active");

			// Add this criteria to the search model
			this.searchModel.set(category, [term]);

			// Trigger the search
			this.triggerSearch();

			// prevent default action of click
			return false;

		},

		removeAdditionalCriteria: function(e){

			// Get the clicked node
			var targetNode = $(e.target);

			//Reference to model
			var model = this.searchModel;

			// remove the styling
			$(".keyword-search-link").removeClass("active");
			$(".keyword-search-link").parent().removeClass("active");

			//Get the term
			var term = targetNode.attr('data-term');

			//Get the current search model additional criteria
			var current = this.searchModel.get('additionalCriteria');
			//If this term is in the current search model (should be)...
			if(_.contains(current, term)){
				//then remove it
				var newTerms = _.without(current, term);
				model.set("additionalCriteria", newTerms);
			}

			//Route to page 1
			this.updatePageNumber(0);

			//Trigger a new search
			this.triggerSearch();
		},

		//Get the facet counts
		getAutocompletes: function(e){
			if(!e) return;

			//Get the text input to determine the filter type
			var input = $(e.target),
				category = input.attr("data-category");

			if(!this.filters || !category) return;

			var viewRef = this;

			//Create the facet query by using our current search query
			var facetQuery = "q=" + this.searchResults.currentquery +
							 "&rows=0" +
							 this.searchModel.getFacetQuery(category) +
							 "&wt=json&";

			//If we've cached these filter results, then use the cache instead of sending a new request
			if(!MetacatUI.appSearchModel.autocompleteCache) MetacatUI.appSearchModel.autocompleteCache = {};
			else if(MetacatUI.appSearchModel.autocompleteCache[facetQuery]){
				this.setupAutocomplete(input, MetacatUI.appSearchModel.autocompleteCache[facetQuery]);
				return;
			}

			//Get the facet counts for the autocomplete
			var requestSettings = {
				url: MetacatUI.appModel.get('queryServiceUrl') + facetQuery,
				type: "GET",
				dataType: "json",
				success: function(data, textStatus, xhr){

					var suggestions = [],
						facetLimit  = 999;

					//Get all the facet counts
					_.each(category.split(","), function(c){
						if(typeof c == "string") c = [c];
						_.each(c, function(thisCategory){
							//Get the field name(s)
							var fieldNames = MetacatUI.appSearchModel.facetNameMap[thisCategory];
							if(typeof fieldNames == "string") fieldNames = [fieldNames];

							//Get the facet counts
							_.each(fieldNames, function(fieldName){
								suggestions.push(data.facet_counts.facet_fields[fieldName]);
							});
						});
					});
					suggestions = _.flatten(suggestions);

					//Format the suggestions
					var rankedSuggestions = new Array();
					for (var i=0; i < Math.min(suggestions.length-1, facetLimit); i+=2) {

            //The label is the item value
            var label = suggestions[i];

            //For all categories except the 'all' category, display the facet count
            if(category != "all"){
              label += " (" + suggestions[i+1] + ")";
            }

            //Push the autocomplete item to the array
						rankedSuggestions.push({
              value: suggestions[i],
              label: label
            });
					}

					//Save these facets in the app so we don't have to send another query
					MetacatUI.appSearchModel.autocompleteCache[facetQuery] = rankedSuggestions;

					//Now setup the actual autocomplete menu
					viewRef.setupAutocomplete(input, rankedSuggestions);
				}
			}
			$.ajax(_.extend(requestSettings, MetacatUI.appUserModel.createAjaxSettings()));
		},

		setupAutocomplete: function(input, rankedSuggestions){
			var viewRef = this;

      //Override the _renderItem() function which renders a single autocomplete item.
      // We want to use the 'title' HTML attribute on each item.
      // This method must create a new <li> element, append it to the menu, and return it.
      $.widget( "custom.autocomplete", $.ui.autocomplete, {
        _renderItem: function(ul, item) {
          return $( document.createElement("li") )
                  .attr( "title", item.label )
                  .append( item.label )
                  .appendTo( ul );
        }
      });

			input.autocomplete({
				source: function (request, response) {
		            var term = $.ui.autocomplete.escapeRegex(request.term)
		                , startsWithMatcher = new RegExp("^" + term, "i")
		                , startsWith = $.grep(rankedSuggestions, function(value) {
		                    return startsWithMatcher.test(value.label || value.value || value);
		                })
		                , containsMatcher = new RegExp(term, "i")
		                , contains = $.grep(rankedSuggestions, function (value) {
		                    return $.inArray(value, startsWith) < 0 &&
		                        containsMatcher.test(value.label || value.value || value);
		                });

		            response(startsWith.concat(contains));
		        },
				select: function(event, ui) {
					// set the text field
					input.val(ui.item.value);
					// add to the filter immediately
					viewRef.updateTextFilters(event, ui.item);
					// prevent default action
					return false;
				},
				position: {
					my: "left top",
					at: "left bottom",
					collision: "flipfit"
				}
			});
		},

		hideClearButton: function(){
			if(!this.filters) return;

			//Show the current filters panel
			this.$(".current-filters-container").slideUp();

			//Hide the reset button
			$('#clear-all').addClass("hidden");
			this.setAutoHeight();
		},

		showClearButton: function(){
			if(!this.filters) return;

			//Show the current filters panel
			if(_.difference(this.searchModel.currentFilters(), this.searchModel.spatialFilters).length > 0)
				this.$(".current-filters-container").slideDown();

			//Show the reset button
			$("#clear-all").removeClass("hidden");
			this.setAutoHeight();
		},

		/**
		 * ==================================================================================================
		 * 											NAVIGATING THE UI
		 * ==================================================================================================
		**/
		//Update all the statistics throughout the page
		updateStats : function() {
			if (this.searchResults.header != null) {
				this.$statcounts = this.$('#statcounts');
				this.$statcounts.html(
					this.statsTemplate({
						start    : this.searchResults.header.get("start") + 1,
						end      : this.searchResults.header.get("start") + this.searchResults.length,
						numFound : this.searchResults.header.get("numFound")
					})
				);
			}

			// piggy back here
			this.updatePager();
		},

		updatePager : function() {
			if (this.searchResults.header != null) {
				var pageCount = Math.ceil(this.searchResults.header.get("numFound") / this.searchResults.header.get("rows"));

				//If no results were found, display a message instead of the list and clear the pagination.
				if(pageCount == 0){
					this.$results.html('<p id="no-results-found">No results found.</p>');

					this.$('#resultspager').html("");
					this.$('.resultspager').html("");
				}
				//Do not display the pagination if there is only one page
				else if(pageCount == 1){
					this.$('#resultspager').html("");
					this.$('.resultspager').html("");
				}
				else{
					var pages = new Array(pageCount);

					// mark current page correctly, avoid NaN
					var currentPage = -1;
					try {
						currentPage = Math.floor((this.searchResults.header.get("start") / this.searchResults.header.get("numFound")) * pageCount);
					} catch (ex) {
						console.log("Exception when calculating pages:" + ex.message);
					}

					//Populate the pagination element in the UI
					this.$('.resultspager').html(
						this.pagerTemplate({
							pages: pages,
							currentPage: currentPage
						})
					);
					this.$('#resultspager').html(
							this.pagerTemplate({
								pages: pages,
								currentPage: currentPage
							})
					);
				}
			}
		},

		updatePageNumber: function(page) {
			MetacatUI.appModel.set("page", page);

			if(!this.isSubView){
				var route = Backbone.history.fragment,
					subroutePos = route.indexOf("/page/"),
					newPage = parseInt(page) + 1;

				//replace the last number with the new one
				if((page > 0) && (subroutePos > -1))
					route = route.replace(/\d+$/, newPage);
				else if(page > 0)
					route += "/page/" + newPage;
				else if(subroutePos >= 0)
					route = route.substring(0, subroutePos);

				MetacatUI.uiRouter.navigate(route);
			}
		},

		// Next page of results
		nextpage: function () {
			this.loading();
			this.searchResults.nextpage();
			this.$resultsview.show();
			this.updateStats();

			var page = MetacatUI.appModel.get("page");
			page++;
			this.updatePageNumber(page);
		},

		// Previous page of results
		prevpage: function () {
			this.loading();
			this.searchResults.prevpage();
			this.$resultsview.show();
			this.updateStats();

			var page = MetacatUI.appModel.get("page");
			page--;
			this.updatePageNumber(page);
		},

		navigateToPage: function(event) {
			var page = $(event.target).attr("page");
			this.showPage(page);
		},

		showPage: function(page) {
			this.loading();
			this.searchResults.toPage(page);
			this.$resultsview.show();
			this.updateStats();
			this.updatePageNumber(page);
			this.updateYearRange();
		},

		/**
		 * ==================================================================================================
		 * 											THE MAP
		 * ==================================================================================================
		**/
		renderMap: function() {

			//If gmaps isn't enabled or loaded with an error, use list mode
			if (!gmaps ||  this.mode == "list") {
				this.ready = true;
				this.mode = "list";
				return;
			}
			$("body").addClass("mapMode");

			//Get the map options and create the map
			gmaps.visualRefresh = true;
			var mapOptions = MetacatUI.mapModel.get('mapOptions');
			$("#map-container").append('<div id="map-canvas"></div>');
			this.map = new gmaps.Map($('#map-canvas')[0], mapOptions);
			MetacatUI.mapModel.set("map", this.map);

			//Hide the map filter toggle element
			this.$(this.mapFilterToggle).hide();

			//Store references
			var mapRef = this.map;
			var viewRef = this;

			google.maps.event.addListener(mapRef, "idle", function(){
				viewRef.ready = true;

				//Remove all markers from the map
				for(var i=0; i < viewRef.resultMarkers.length; i++){
					viewRef.resultMarkers[i].setMap(null);
				}
				viewRef.resultMarkers = new Array();

				//Trigger a resize so the map background image tiles load completely
				google.maps.event.trigger(mapRef, 'resize');

				var currentMapCenter = MetacatUI.mapModel.get("map").getCenter(),
					savedMapCenter   = MetacatUI.mapModel.get("mapOptions").center,
					needsRecentered  = (currentMapCenter != savedMapCenter);

				//If we are doing a new search...
				if(viewRef.allowSearch){

					//If the map is at the minZoom, i.e. zoomed out all the way so the whole world is visible, do not apply the spatial filter
					if(viewRef.map.getZoom() == mapOptions.minZoom){

						if(!viewRef.hasZoomed){
							if(needsRecentered && !viewRef.hasDragged) MetacatUI.mapModel.get("map").setCenter(savedMapCenter);
							return;
						}

						//Hide the map filter toggle element
						viewRef.$(viewRef.mapFilterToggle).hide();

						viewRef.resetMap();
					}
					else{
						//If the user has not zoomed or dragged to a new area of the map yet and our map is off-center, recenter it
						if(!viewRef.hasZoomed && needsRecentered)
							MetacatUI.mapModel.get("map").setCenter(savedMapCenter);

						//Show the map filter toggle element
						viewRef.$(viewRef.mapFilterToggle).show();

						//Get the Google map bounding box
						var boundingBox = mapRef.getBounds();

						//Set the search model spatial filters
						//Encode the Google Map bounding box into geohash
						var north = boundingBox.getNorthEast().lat(),
							west  = boundingBox.getSouthWest().lng(),
							south = boundingBox.getSouthWest().lat(),
							east  = boundingBox.getNorthEast().lng();

						viewRef.searchModel.set('north', north);
						viewRef.searchModel.set('west',  west);
						viewRef.searchModel.set('south', south);
						viewRef.searchModel.set('east',  east);

						//Save the center position and zoom level of the map
						MetacatUI.mapModel.get("mapOptions").center = mapRef.getCenter();
						MetacatUI.mapModel.get("mapOptions").zoom   = mapRef.getZoom();

						//Determine the precision of geohashes to search for
						var zoom = mapRef.getZoom();

						var precision = MetacatUI.mapModel.getSearchPrecision(zoom);

						//Get all the geohash tiles contained in the map bounds
						var geohashBBoxes = nGeohash.bboxes(south, west, north, east, precision);

						//Save our geohash search settings
						viewRef.searchModel.set('geohashes', geohashBBoxes);
						viewRef.searchModel.set('geohashLevel', precision);
					}

					//Reset to the first page
					if(viewRef.hasZoomed)
						MetacatUI.appModel.set("page", 0);

					//Trigger a new search
					viewRef.triggerSearch();

					viewRef.allowSearch = false;
				}
				//Else, if this is the fresh map render on page load
				else{
					if(needsRecentered && !viewRef.hasDragged)
						MetacatUI.mapModel.get("map").setCenter(savedMapCenter);

					//Show the map filter toggle element
					if(viewRef.map.getZoom() > mapOptions.minZoom)
						viewRef.$(viewRef.mapFilterToggle).show();
				}

				viewRef.hasZoomed = false;
			});

			//When the user has zoomed in or out on the map, we want to trigger a new search
			google.maps.event.addListener(mapRef, "zoom_changed", function(){
				viewRef.allowSearch = true;
				viewRef.hasZoomed = true;
			});

			//When the user has dragged the map to a new location, we don't want to load cached results.
			//We still may not trigger a new search because the user has to zoom in first, after the map initially loads at full-world view
			google.maps.event.addListener(mapRef, "dragend", function(){
				viewRef.hasDragged = true;

				if(viewRef.map.getZoom() > mapOptions.minZoom){
					viewRef.hasZoomed = true;
					viewRef.allowSearch = true;
				}
			});

		},

		//Resets the model and view settings related to the map
		resetMap : function(){
			if(!gmaps){
				return;
			}

			//First reset the model
			//The categories pertaining to the map
			var categories = ["east", "west", "north", "south"];

			//Loop through each and remove the filters from the model
			for(var i = 0; i < categories.length; i++){
				this.searchModel.set(categories[i], null);
			}

			//Reset the map settings
			this.searchModel.resetGeohash();
			MetacatUI.mapModel.set("mapOptions", MetacatUI.mapModel.defaults().mapOptions);

			this.allowSearch = false;
		},

		toggleMapFilter: function(e, a){
			var toggleInput = this.$("input" + this.mapFilterToggle);
			if((typeof toggleInput === "undefined") || !toggleInput) return;

			var isOn = $(toggleInput).prop("checked");

			//If the user clicked on the label, then change the checkbox for them
			if(e.target.tagName != "INPUT"){
				isOn = !isOn;
				toggleInput.prop("checked", isOn);
			}

			if(isOn)
				this.searchModel.set("useGeohash", true);
			else
				this.searchModel.set("useGeohash", false);

			//Tell the map to trigger a new search and redraw tiles
			this.allowSearch = true;
			google.maps.event.trigger(MetacatUI.mapModel.get("map"), "idle");

			//Send this event to Google Analytics
			if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined")){
				var action = isOn? "on" : "off";
				ga("send", "event", "map", action);
			}
		},

		/**
		 * Show the marker, infoWindow, and bounding coordinates polygon on the map when the user hovers on the marker icon in the result list
		 */
		showResultOnMap: function(e){
			//Exit if maps are not in use
			if((this.mode != "map") || (!gmaps)){
				return false;
			}

			//Get the attributes about this dataset
			var resultRow = e.target,
				id = $(resultRow).attr("data-id");
			//The mouseover event might be triggered by a nested element, so loop through the parents to find the id
			if(typeof id == "undefined"){
				$(resultRow).parents().each(function(){
					if(typeof $(this).attr('data-id') != "undefined"){
						id = $(this).attr('data-id');
						resultRow = this;
					}
				});
			}

			//Find the tile for this data set and highlight it on the map
			var resultGeohashes = this.searchResults.findWhere({id: id}).get("geohash_9");
			for(var i=0; i < resultGeohashes.length; i++){
				var thisGeohash = resultGeohashes[i],
					latLong = nGeohash.decode(thisGeohash),
					position = new google.maps.LatLng(latLong.latitude, latLong.longitude),
					containingTileGeohash = _.find(this.tileGeohashes, function(g){ return thisGeohash.indexOf(g) == 0 }),
					containingTile = _.findWhere(this.tiles, {geohash: containingTileGeohash });

				//If this is a geohash for a georegion outside the map, do not highlight a tile or display a marker
				if(typeof containingTile === "undefined") continue;

				this.highlightTile(containingTile);

				//Set up the options for each marker
				var markerOptions = {
					position: position,
					icon: MetacatUI.mapModel.get("markerImage"),
					zIndex: 99999,
					map: this.map
				};

				//Create the marker and add to the map
				var marker = new google.maps.Marker(markerOptions);

				this.resultMarkers.push(marker);

			}
		},

		/**
		 * Hide the marker, infoWindow, and bounding coordinates polygon on the map when the user stops hovering on the marker icon in the result list
		 */
		hideResultOnMap: function(e){
			//Exit if maps are not in use
			if((this.mode != "map") || (!gmaps)){
				return false;
			}

			//Get the attributes about this dataset
			var resultRow = e.target,
				id = $(resultRow).attr("data-id");
			//The mouseover event might be triggered by a nested element, so loop through the parents to find the id
			if(typeof id == "undefined"){
				$(e.target).parents().each(function(){
					if(typeof $(this).attr('data-id') != "undefined"){
						id = $(this).attr('data-id');
						resultRow = this;
					}
				});
			}

			//Get the map tile for this result and un-highlight it
			var resultGeohashes = this.searchResults.findWhere({id: id}).get("geohash_9");
			for(var i=0; i < resultGeohashes.length; i++){
				var thisGeohash = resultGeohashes[i],
					containingTileGeohash = _.find(this.tileGeohashes, function(g){ return thisGeohash.indexOf(g) == 0 }),
					containingTile = _.findWhere(this.tiles, {geohash: containingTileGeohash });

				//If this is a geohash for a georegion outside the map, do not unhighlight a tile
				if(typeof containingTile === "undefined") continue;

				//Unhighlight the tile
				this.unhighlightTile(containingTile);
			}

			 //Remove all markers from the map
			_.each(this.resultMarkers, function(marker){ marker.setMap(null); });
			this.resultMarkers = new Array();
		},

		/**
		 * Create a tile for each geohash facet. A separate tile label is added to the map with the count of the facet.
		 **/
		drawTiles: function(){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			TextOverlay.prototype = new google.maps.OverlayView();

			/** @constructor */
			function TextOverlay(options) {
				// Now initialize all properties.
				  this.bounds_ = options.bounds;
				  this.map_    = options.map;
				  this.text    = options.text;
				  this.color   = options.color;

				  var length = options.text.toString().length;
				  if(length == 1) this.width = 8;
				  else if(length == 2) this.width = 17;
				  else if(length == 3) this.width = 25;
				  else if(length == 4) this.width = 32;
				  else if(length == 5) this.width = 40;

				  // We define a property to hold the image's div. We'll
				  // actually create this div upon receipt of the onAdd()
				  // method so we'll leave it null for now.
				  this.div_ = null;

				  // Explicitly call setMap on this overlay
				  this.setMap(options.map);
			}

			TextOverlay.prototype.onAdd = function() {

			  // Create the DIV and set some basic attributes.
			  var div = document.createElement('div');
			  div.style.color = this.color;
			  div.style.fontSize = "15px";
			  div.style.position = 'absolute';
			  div.style.zIndex = "999";
			  div.style.fontWeight = "bold";

			  // Create an IMG element and attach it to the DIV.
			  div.innerHTML = this.text;

			  // Set the overlay's div_ property to this DIV
			  this.div_ = div;

			  // We add an overlay to a map via one of the map's panes.
			  // We'll add this overlay to the overlayLayer pane.
			  var panes = this.getPanes();
			  panes.overlayLayer.appendChild(div);
			}

			TextOverlay.prototype.draw = function() {
				// Size and position the overlay. We use a southwest and northeast
				  // position of the overlay to peg it to the correct position and size.
				  // We need to retrieve the projection from this overlay to do this.
				  var overlayProjection = this.getProjection();

				  // Retrieve the southwest and northeast coordinates of this overlay
				  // in latlngs and convert them to pixels coordinates.
				  // We'll use these coordinates to resize the DIV.
				  var sw = overlayProjection.fromLatLngToDivPixel(this.bounds_.getSouthWest());
				  var ne = overlayProjection.fromLatLngToDivPixel(this.bounds_.getNorthEast());
				  // Resize the image's DIV to fit the indicated dimensions.
				  var div = this.div_;
				  var width = this.width;
				  var height = 20;

				  div.style.left = (sw.x - width/2) + 'px';
				  div.style.top = (ne.y - height/2) + 'px';
				  div.style.width = width + 'px';
				  div.style.height = height + 'px';
				  div.style.width = width + "px";
				  div.style.height = height + "px";

			}

			TextOverlay.prototype.onRemove = function() {
				  this.div_.parentNode.removeChild(this.div_);
				  this.div_ = null;
			}

			//Determine the geohash level we will use to draw tiles
			var currentZoom     = this.map.getZoom(),
				geohashLevelNum	= MetacatUI.mapModel.determineGeohashLevel(currentZoom),
				geohashLevel    = "geohash_" + geohashLevelNum,
				geohashes       = this.searchResults.facetCounts[geohashLevel];

			//Save the current geohash level in the map model
			MetacatUI.mapModel.set("tileGeohashLevel", geohashLevelNum);

			//Get all the geohashes contained in the map
			var mapBBoxes = _.flatten(_.values(this.searchModel.get("geohashGroups")));

			//Geohashes may be returned that are part of datasets with multiple geographic areas. Some of these may be outside this map.
			//So we will want to filter out geohashes that are not contained in this map.
			if(mapBBoxes.length == 0){
				var filteredTileGeohashes = geohashes;
			}
			else{
				var filteredTileGeohashes = [];
				for(var i=0; i<geohashes.length-1; i+=2){

					//Get the geohash for this tile
					var tileGeohash	= geohashes[i],
						isInsideMap = false,
						index		= 0,
						searchString = tileGeohash;

					//Find if any of the bounding boxes/geohashes inside our map contain this tile geohash
					while((!isInsideMap) && (searchString.length > 0)){
						searchString = tileGeohash.substring(0, tileGeohash.length-index);
						if(_.contains(mapBBoxes, searchString)) isInsideMap = true;
						index++;
					}

					if(isInsideMap){
						filteredTileGeohashes.push(tileGeohash);
						filteredTileGeohashes.push(geohashes[i+1]);
					}
				}
			}

			//Make a copy of the array that is geohash counts only
			var countsOnly = [];
			for(var i=1; i < filteredTileGeohashes.length; i+=2){
				countsOnly.push(filteredTileGeohashes[i]);
			}

			//Create a range of lightness to make different colors on the tiles
			var lightnessMin = MetacatUI.mapModel.get("tileLightnessMin"),
				lightnessMax = MetacatUI.mapModel.get("tileLightnessMax"),
				lightnessRange = lightnessMax - lightnessMin;

			//Get some stats on our tile counts so we can normalize them to create a color scale
			var findMedian = function(nums){
				if(nums.length % 2 == 0)
					return (nums[(nums.length/2)-1] + nums[(nums.length/2)])/2;
				else
					return nums[(nums.length/2)-0.5];
			}
			var sortedCounts = countsOnly.sort(function(a,b){ return a-b; }),
				maxCount = sortedCounts[sortedCounts.length-1],
				minCount = sortedCounts[0];
				/*median = findMedian(sortedCounts),
				partitionedCounts = _.partition(sortedCounts, function(num){ return( num < median ) }),
				firstQuartile = findMedian(partitionedCounts[0]),
				thirdQuartile = findMedian(partitionedCounts[1]),
				iqr = (thirdQuartile - firstQuartile)*1.5,
				minInterval = firstQuartile - iqr,
				maxInterval = thirdQuartile + iqr;

			var lowOutliers = _.filter(partitionedCounts[0], function(num){ return(num < minInterval); }),
				highOutliers = _.filter(partitionedCounts[1], function(num){ return(num > maxInterval); });
			*/
			var viewRef = this;

			//Now draw a tile for each geohash facet
			for(var i=0; i<filteredTileGeohashes.length-1; i+=2){

				//Convert this geohash to lat,long values
				var tileGeohash	   = filteredTileGeohashes[i],
					decodedGeohash = nGeohash.decode(tileGeohash),
					latLngCenter   = new google.maps.LatLng(decodedGeohash.latitude, decodedGeohash.longitude),
					geohashBox 	   = nGeohash.decode_bbox(tileGeohash),
					swLatLng	   = new google.maps.LatLng(geohashBox[0], geohashBox[1]),
					neLatLng	   = new google.maps.LatLng(geohashBox[2], geohashBox[3]),
					bounds 		   = new google.maps.LatLngBounds(swLatLng, neLatLng),
					tileCount	   = filteredTileGeohashes[i+1],
					drawMarkers    = MetacatUI.mapModel.get("drawMarkers"),
					marker,
					count,
					color;

				//Normalize the range of tiles counts and convert them to a lightness domain of 20-70% lightness.
				if(maxCount - minCount == 0)
					var lightness = lightnessRange;
				else
					var lightness = (((tileCount-minCount)/(maxCount-minCount)) * lightnessRange) + lightnessMin;

				var color = "hsl(" + MetacatUI.mapModel.get("tileHue") + "," + lightness + "%,50%)";

				//Add the count to the tile
				var countLocation = new google.maps.LatLngBounds(latLngCenter, latLngCenter);

				//Draw the tile label with the dataset count
				count = new TextOverlay({
					bounds: countLocation,
					   map: this.map,
					  text: tileCount,
					 color: MetacatUI.mapModel.get("tileLabelColor")
				});

				//Set up the default tile options
				var tileOptions = {
					      fillColor: color,
					      strokeColor: color,
					      map: this.map,
					      visible: true,
					      bounds: bounds
					    };

				//Merge these options with any tile options set in the map model
				var modelTileOptions =  MetacatUI.mapModel.get("tileOptions");
				for(var attr in modelTileOptions){
					tileOptions[attr] = modelTileOptions[attr];
				}

				//Draw this tile
				var tile = this.drawTile(tileOptions, tileGeohash, count);

				//Save the geohashes for tiles in the view for later
				this.tileGeohashes.push(tileGeohash);
			}

			//Create an info window for each marker that is on the map, to display when it is clicked on
			if(this.markerGeohashes.length > 0) this.addMarkers();

			//If the map is zoomed all the way in, draw info windows for each tile that will be displayed when they are clicked on
			if(MetacatUI.mapModel.isMaxZoom(this.map)) this.addTileInfoWindows();
		},

		/**
		 * With the options and label object given, add a single tile to the map and set its event listeners
		 **/
		drawTile: function(options, geohash, label){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			// Add the tile for these datasets to the map
			var tile = new google.maps.Rectangle(options);

			var viewRef = this;

			//Save our tiles in the view
			var tileObject = {
					 text: label,
					 shape: tile,
					 geohash: geohash,
					 options: options
			};
			this.tiles.push(tileObject);

			//Change styles when the tile is hovered on
			google.maps.event.addListener(tile, 'mouseover', function(event) {
				viewRef.highlightTile(tileObject);
			});

			//Change the styles back after the tile is hovered on
			google.maps.event.addListener(tile, 'mouseout', function(event) {
				viewRef.unhighlightTile(tileObject);
			});

			//If we are at the max zoom, we will display an info window. If not, we will zoom in.
			if(!MetacatUI.mapModel.isMaxZoom(viewRef.map)){

				/** Set up some helper functions for zooming in on the map **/
				var myFitBounds = function(myMap, bounds) {
				    myMap.fitBounds(bounds); // calling fitBounds() here to center the map for the bounds

				    var overlayHelper = new google.maps.OverlayView();
				    overlayHelper.draw = function () {
				        if (!this.ready) {
				            var extraZoom = getExtraZoom(this.getProjection(), bounds, myMap.getBounds());
				            if (extraZoom > 0) {
				                myMap.setZoom(myMap.getZoom() + extraZoom);
				            }
				            this.ready = true;
				            google.maps.event.trigger(this, 'ready');
				        }
				    };
				    overlayHelper.setMap(myMap);
				}
				 var getExtraZoom = function(projection, expectedBounds, actualBounds) {

				    // in: LatLngBounds bounds -> out: height and width as a Point
				    var getSizeInPixels = function(bounds) {
				        var sw = projection.fromLatLngToContainerPixel(bounds.getSouthWest());
				        var ne = projection.fromLatLngToContainerPixel(bounds.getNorthEast());
				        return new google.maps.Point(Math.abs(sw.y - ne.y), Math.abs(sw.x - ne.x));
				    }

				    var expectedSize = getSizeInPixels(expectedBounds),
				        actualSize = getSizeInPixels(actualBounds);

				    if (Math.floor(expectedSize.x) == 0 || Math.floor(expectedSize.y) == 0) {
				        return 0;
				    }

				    var qx = actualSize.x / expectedSize.x;
				    var qy = actualSize.y / expectedSize.y;
				    var min = Math.min(qx, qy);

				    if (min < 1) {
				        return 0;
				    }

				    return Math.floor(Math.log(min) / Math.LN2 /* = log2(min) */);
				}

				//Zoom in when the tile is clicked on
				gmaps.event.addListener(tile, 'click', function(clickEvent) {
					//Change the center
					viewRef.map.panTo(clickEvent.latLng);

					//Get this tile's bounds
					var tileBounds = tile.getBounds();
					//Get the current map bounds
					var mapBounds = viewRef.map.getBounds();

					//Change the zoom
					//viewRef.map.fitBounds(tileBounds);
					myFitBounds(viewRef.map, tileBounds);


					//Send this event to Google Analytics
					if(MetacatUI.appModel.get("googleAnalyticsKey") && (typeof ga !== "undefined"))
						ga("send", "event", "map", "clickTile", "geohash : " + tileObject.geohash);
				});
			}

			return tile;
		},

		highlightTile: function(tile){
			//Change the tile style on hover
			tile.shape.setOptions(MetacatUI.mapModel.get('tileOnHover'));

			//Change the label color on hover
			var div = tile.text.div_;
			div.style.color = MetacatUI.mapModel.get("tileLabelColorOnHover");
			tile.text.div_ = div;
			$(div).css("color", MetacatUI.mapModel.get("tileLabelColorOnHover"));
		},

		unhighlightTile: function(tile){
			//Change back the tile to it's original styling
			tile.shape.setOptions(tile.options);

			//Change back the label color
			var div = tile.text.div_;
			div.style.color = MetacatUI.mapModel.get("tileLabelColor");
			tile.text.div_ = div;
			$(div).css("color", MetacatUI.mapModel.get("tileLabelColor"));
		},

		/**
		 * Get the details on each marker
		 * And create an infowindow for that marker
		 */
		addMarkers: function(){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			//Clone the Search model
			var searchModelClone = this.searchModel.clone(),
				geohashLevel = MetacatUI.mapModel.get("tileGeohashLevel"),
				viewRef = this,
				markers = this.markers;

			//Change the geohash filter to match our tiles
			searchModelClone.set("geohashLevel", geohashLevel);
			searchModelClone.set("geohashes", this.markerGeohashes);

			//Now run a query to get a list of documents that are represented by our markers
			var query = "q=" + searchModelClone.getQuery() +
						"&fl=id,title,geohash_9,abstract,geohash_" + geohashLevel +
						"&rows=1000" +
						"&wt=json";

			var requestSettings = {
				url: MetacatUI.appModel.get('queryServiceUrl') + query,
				success: function(data, textStatus, xhr){
					var docs = data.response.docs;
					var uniqueGeohashes = viewRef.markerGeohashes;

					//Create a marker and infoWindow for each document
					_.each(docs, function(doc, key, list){

						var marker,
							drawMarkersAt = [];

						// Find the tile place that this document belongs to
						// For each geohash value at the current geohash level for this document,
						_.each(doc.geohash_9, function(geohash, key, list){
							// Loop through each unique tile location to find its match
							for(var i=0; i <= uniqueGeohashes.length; i++){
								if(uniqueGeohashes[i] == geohash.substr(0, geohashLevel)){
									drawMarkersAt.push(geohash);
									uniqueGeohashes = _.without(uniqueGeohashes, geohash);
								}
							}
						});

						_.each(drawMarkersAt, function(markerGeohash, key, list){

							var decodedGeohash = nGeohash.decode(markerGeohash),
								latLng   	   = new google.maps.LatLng(decodedGeohash.latitude, decodedGeohash.longitude);

							//Set up the options for each marker
							var markerOptions = {
								position: latLng,
								icon: MetacatUI.mapModel.get("markerImage"),
								zIndex: 99999,
								map: viewRef.map
							};

							//Create the marker and add to the map
							var marker = new google.maps.Marker(markerOptions);
						});
					});
				}
			}
			$.ajax(_.extend(requestSettings, MetacatUI.appUserModel.createAjaxSettings()));

		},

		/**
		 * Get the details on each tile - a list of ids and titles for each dataset contained in that tile
		 * And create an infowindow for that tile
		 */
		addTileInfoWindows: function(){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			//Clone the Search model
			var searchModelClone = this.searchModel.clone(),
				geohashLevel = MetacatUI.mapModel.get("tileGeohashLevel"),
				geohashName	 = "geohash_" + geohashLevel,
				viewRef = this,
				infoWindows = [];

			//Change the geohash filter to match our tiles
			searchModelClone.set("geohashLevel", geohashLevel);
			searchModelClone.set("geohashes", this.tileGeohashes);

			//Now run a query to get a list of documents that are represented by our tiles
			var query = "q=" + searchModelClone.getQuery() +
						"&fl=id,title,geohash_9," + geohashName +
						"&rows=1000" +
						"&wt=json";

			var requestSettings = {
				url: MetacatUI.appModel.get('queryServiceUrl') + query,
				success: function(data, textStatus, xhr){
					//Make an infoWindow for each doc
					var docs = data.response.docs;

					//For each tile, loop through the docs to find which ones to include in its infoWindow
					_.each(viewRef.tiles, function(tile, key, list){

						var infoWindowContent = "";

						_.each(docs, function(doc, key, list){

							//Is this document in this tile?
							for(var i=0; i < doc[geohashName].length; i++){
								if(doc[geohashName][i] == tile.geohash){
									//Add this doc to the infoWindow content
									infoWindowContent += "<a href='" + MetacatUI.root + "/view/" + doc.id + "'>" + doc.title +"</a> (" + doc.id +") <br/>"
									break;
								}
							}
						});

						//The center of the tile
						var decodedGeohash = nGeohash.decode(tile.geohash),
							tileCenter 	   = new google.maps.LatLng(decodedGeohash.latitude, decodedGeohash.longitude);

						//The infowindow
						var infoWindow = new gmaps.InfoWindow({
							content:
								'<div class="gmaps-infowindow">'
								+ '<h4> Datasets located here </h4>'
								+ "<p>" + infoWindowContent + "</p>"
								+ '</div>',
							isOpen: false,
							disableAutoPan: false,
							maxWidth: 250,
							position: tileCenter
						});

						viewRef.tileInfoWindows.push(infoWindow);

						//Zoom in when the tile is clicked on
						gmaps.event.addListener(tile.shape, 'click', function(clickEvent) {

							//--- We are at max zoom, display an infowindow ----//
							if(MetacatUI.mapModel.isMaxZoom(viewRef.map)){

								//Find the infowindow that belongs to this tile in the view
								infoWindow.open(viewRef.map);
								infoWindow.isOpen = true;

								//Close all other infowindows
								viewRef.closeInfoWindows(infoWindow);
							}

							//------ We are not at max zoom, so zoom into this tile ----//
							else{
								//Change the center
								viewRef.map.panTo(clickEvent.latLng);

								//Get this tile's bounds
								var bounds = tile.shape.getBounds();

								//Change the zoom
								viewRef.map.fitBounds(bounds);
							}
						});

						//Close the infowindow upon any click on the map
						gmaps.event.addListener(viewRef.map, 'click', function() {
							infoWindow.close();
							infoWindow.isOpen = false;
						});

						infoWindows[tile.geohash] = infoWindow;
					});

					viewRef.infoWindows = infoWindows;
				}
			}
			$.ajax(_.extend(requestSettings, MetacatUI.appUserModel.createAjaxSettings()));
		},

		/**
		 * Iterate over each infowindow that we have stored in the view and close it.
		 * Pass an infoWindow object to this function to keep that infoWindow open/skip it
		 */
		closeInfoWindows: function(except){
			var infoWindowLists = [this.markerInfoWindows, this.tileInfoWindows];

			_.each(infoWindowLists, function(infoWindows, key, list){
				//Iterate over all the marker infowindows and close all of them except for this one
				for(var i=0; i<infoWindows.length; i++){
					if((infoWindows[i].isOpen) && (infoWindows[i] != except)){
						//Close this info window and stop looking, since only one of each kind should be open anyway
						infoWindows[i].close();
						infoWindows[i].isOpen = false;
						i = infoWindows.length;
					}
				}
			});
		},

		/**
		 * Remove all the tiles and text from the map
		 **/
		removeTiles: function(){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			//Remove the tile from the map
			_.each(this.tiles, function(tile, key, list){
				if(tile.shape) tile.shape.setMap(null);
				if(tile.text)  tile.text.setMap(null);
			});

			//Reset the tile storage in the view
			this.tiles = [];
			this.tileGeohashes = [];
			this.tileInfoWindows = [];
		},

		/**
		 * Iterate over all the markers in the view and remove them from the map and view
		 */
		removeMarkers: function(){
			//Exit if maps are not in use
			if((this.mode != 'map') || (!gmaps)){
				return false;
			}

			//Remove the marker from the map
			_.each(this.markers, function(marker, key, list){
				marker.marker.setMap(null);
			});

			//Reset the marker storage in the view
			this.markers = [];
			this.markerGeohashes = [];
			this.markerInfoWindows = [];
		},


		/**
		 * ==================================================================================================
		 * 											ADDING RESULTS
		 * ==================================================================================================
		**/

		/** Add all items in the **SearchResults** collection
		 * This loads the first 25, then waits for the map to be
		 * fully loaded and then loads the remaining items.
		 * Without this delay, the app waits until all records are processed
		*/
		addAll: function () {
			//After the map is done loading, then load the rest of the results into the list
			if(this.ready) this.renderAll();
			else{
				var viewRef = this;
				var intervalID = setInterval(function() {
					if (viewRef.ready) {
						clearInterval(intervalID);
						viewRef.renderAll();
					}
				}, 500);
			}

			//After all the results are loaded, query for our facet counts in the background
			//this.getAutocompletes();
		},

		renderAll: function(){
			// do this first to indicate coming results
			this.updateStats();

			//Remove all the existing tiles on the map
			this.removeTiles();
			this.removeMarkers();

			//Remove the loading class and styling
			this.$results.removeClass('loading');

			//If there are no results, display so
			var numFound = this.searchResults.length;
			if (numFound == 0){
				this.$results.html('<p id="no-results-found">No results found.</p>');
				if(MetacatUI.theme == "arctic"){
					//When we get new results, check if the user is searching for their own datasets and display a message
					if((MetacatUI.appView.dataCatalogView && MetacatUI.appView.dataCatalogView.searchModel.getQuery() == MetacatUI.appUserModel.get("searchModel").getQuery()) && !MetacatUI.appSearchResults.length){
						$("#no-results-found").after("<h3>Where are my data sets?</h3><p>If you are a previous ACADIS Gateway user, " +
						"you will need to take additional steps to access your data sets in the new NSF Arctic Data Center." +
						"<a href='mailto:support@arcticdata.io'>Send us a message at support@arcticdata.io</a> with your old ACADIS " +
						"Gateway username and your ORCID identifier (" + MetacatUI.appUserModel.get("username") + "), we will help.</p>");
					}
				}
				return;
			}

			//Clear the results list before we start adding new rows
			this.$results.html('');

			//--First map all the results--
			if(gmaps){
				//Draw all the tiles on the map to represent the datasets
				this.drawTiles();

				//Remove the loading styles from the map
				$("#map-container").removeClass("loading");
			}
			
			var pid_list = new Array();

			//--- Add all the results to the list ---
			for (i = 0; i < this.searchResults.length; i++) {
				pid_list.push(this.searchResults.models[i].get("id"));
			};
			// console.log(pid_list);
			var metricsModel = new MetricsModel({pid_list: pid_list, type: "catalog"});
			metricsModel.fetch();
			this.metricsModel = metricsModel;

			//--- Add all the results to the list ---
			for (i = 0; i < this.searchResults.length; i++) {
				var element = this.searchResults.models[i];
				if(typeof element !== "undefined") this.addOne(element, this.metricsModel);
			};

			// Initialize any tooltips within the result item
			$(".tooltip-this").tooltip();
			$(".popover-this").popover();

			//Set the autoheight
			this.setAutoHeight();
		},

		/**
		 * Add a single SolrResult item to the list by creating a view for it and appending its element to the DOM.
		 */
		addOne: function (result) {
			//Get the view and package service URL's
			this.$view_service = MetacatUI.appModel.get('viewServiceUrl');
			this.$package_service = MetacatUI.appModel.get('packageServiceUrl');
			result.set( {view_service: this.$view_service, package_service: this.$package_service} );

			//Create a new result item
			var view = new SearchResultView({ model: result, metricsModel: this.metricsModel });

			//Add this item to the list
			this.$results.append(view.render().el);

			// map it
			if(gmaps && (typeof result.get("geohash_9") != "undefined") && (result.get("geohash_9") != null)){
				var title = result.get("title");

				for(var i=0; i<result.get("geohash_9").length; i++){
					var centerGeohash = result.get("geohash_9")[i],
						decodedGeohash = nGeohash.decode(centerGeohash),
						position = new google.maps.LatLng(decodedGeohash.latitude, decodedGeohash.longitude),
						marker = new gmaps.Marker({
							position: position,
							icon: MetacatUI.mapModel.get("markerImage"),
							zIndex: 99999
						});
				}
			}
		},


		/**
		 * ==================================================================================================
		 * 											STYLING THE UI
		 * ==================================================================================================
		**/
		toggleMapMode: function(e){
			if(typeof e === "object")
				e.preventDefault();

			if(gmaps){
				$('body').toggleClass('mapMode');
			}

			if(this.mode == 'map'){
				MetacatUI.appModel.set('searchMode', 'list');
				this.mode = "list";
				this.$("#map-canvas").detach();
				this.setAutoHeight();
				this.getResults();
			}
			else if (this.mode == 'list'){
				MetacatUI.appModel.set('searchMode', 'map');
				this.mode = "map";
				this.renderMap();
				this.setAutoHeight();
				this.getResults();
			}
		},

		// Communicate that the page is loading
		loading: function () {
			$("#map-container").addClass("loading");
			this.$results.addClass("loading");

			this.$results.html(this.loadingTemplate({ msg: "Searching for data..." }));
		},

		//Toggles the collapseable filters sidebar and result list in the default theme
		collapse: function(e){
			var id = $(e.target).attr('data-collapse');

			$('#'+id).toggleClass('collapsed');
		},

		toggleFilterCollapse: function(e){
			if(typeof e !== "undefined")
				var container = $(e.target).parents(".filter-contain.collapsable");
			else
				var container = this.$(".filter-contain.collapsable");

			//If we can't find a container, then don't do anything
			if(container.length < 1) return;

			//Expand
			if($(container).is(".collapsed")){
				//Toggle the visibility of the collapse/expand icons
				$(container).find(".expand").hide();
				$(container).find(".collapse").show();

				//Cache the height of this element so we can reset it on collapse
				$(container).attr("data-height", $(container).css("height"));

				//Increase the height of the container to expand it
				$(container).css("max-height", "3000px");
			}
			//Collapse
			else{
				//Toggle the visibility of the collapse/expand icons
				$(container).find(".collapse").hide();
				$(container).find(".expand").show();

				//Decrease the height of the container to collapse it
				if($(container).attr("data-height"))
					$(container).css("max-height", $(container).attr("data-height"));
				else
					$(container).css("max-height", "1.5em");
			}

			$(container).toggleClass("collapsed");
		},

		//Move the popover element up the page a bit if it runs off the bottom of the page
		preventPopoverRunoff: function(e){

			//In map view only (because all elements are fixed and you can't scroll)
			if(this.mode == 'map'){
				var viewportHeight = $('#map-container').outerHeight();
			}
			else{
				return false;
			}

			if($('.popover').length > 0){
				var offset = $('.popover').offset();
				var popoverHeight = $('.popover').outerHeight();
				var topPosition = offset.top;

				//If pixels are cut off the top of the page, readjust its vertical position
				if(topPosition < 0){
					$('.popover').offset({top: 10});
				}
				else{
					//Else, let's check if it is cut off at the bottom
					var totalHeight = topPosition + popoverHeight;

					var pixelsHidden = totalHeight - viewportHeight;

					var newTopPosition = topPosition - pixelsHidden - 40;

					//If pixels are cut off the bottom of the page, readjust its vertical position
					if(pixelsHidden > 0){
						$('.popover').offset({top: newTopPosition});
					}
				}
			}

		},

		onClose: function () {
			this.stopListening();

			$(".DataCatalog").removeClass("DataCatalog");

			if(gmaps){
				// unset map mode
				$("body").removeClass("mapMode");
				$("#map-canvas").remove();
			}

			// remove everything so we don't get a flicker
			this.$el.html('');
		}
	});
	return DataCatalogView;
});
