﻿/*global Backbone */
'use strict';

define(['jquery',	'underscore', 'backbone'],
function ($, _, Backbone) {

	// MetacatUI Router
	// ----------------
	var UIRouter = Backbone.Router.extend({
		routes: {
			''                          : 'renderIndex',    // the default route
			'about(/:anchorId)'         : 'renderAbout',    // about page
			'help(/:page)(/:anchorId)'  : 'renderHelp',
			'tools(/:anchorId)'         : 'renderTools',    // tools page
			'data/my-data(/page/:page)' : 'renderMyData',    // data search page
			'data(/mode=:mode)(/query=:query)(/page/:page)' : 'renderData',    // data search page
			'data/my-data'              : 'renderMyData',
			'profile(/*username)(/s=:section)(/s=:subsection)' : 'renderProfile',
			'my-profile(/s=:section)(/s=:subsection)' : 'renderMyProfile',
			//'my-account'                   : 'renderUserSettings',
			'external(/*url)'           : 'renderExternal', // renders the content of the given url in our UI
			'logout'                    : 'logout',    		// logout the user
			'signout'                   : 'logout',    		// logout the user
			'signin'                    : 'renderSignIn',    		// logout the user
			"signinsuccess"             : "renderSignInSuccess",
			"signinldaperror"           : "renderLdapSignInError",
			"signinLdap"                : "renderLdapSignIn",
			"signinSuccessLdap"         : "renderLdapSignInSuccess",
			'share(/*pid)'              : 'renderEditor', // registry page
			'submit(/*pid)'             : 'renderEditor', // registry page
			'quality(/s=:suiteId)(/:pid)' : 'renderMdqRun', // MDQ page
			'api(/:anchorId)'           : 'renderAPI'       // API page
		},

		helpPages: {
			"search" : "searchTips",
			defaultPage : "searchTips"
		},

		initialize: function(){
			this.listenTo(Backbone.history, "routeNotFound", this.navigateToDefault);

			// This route handler replaces the route handler we had in the
			// routes table before which was "view/*pid". The * only finds URL
			// parts until the ? but DataONE PIDs can have ? in them so we need
			// to make this route more inclusive.
			this.route(/^view\/(.*)$/, "renderMetadata");

			this.on("route", this.trackPathName);

			// Clear stale JSONLD and meta tags
			this.on("route", this.clearJSONLD);
			this.on("route", this.clearHighwirePressMetaTags);
		},

		//Keep track of navigation movements
		routeHistory: new Array(),
		pathHistory: new Array(),

		// Will return the last route, which is actually the second to last item in the route history,
		// since the last item is the route being currently viewed
		lastRoute: function(){
			if((typeof this.routeHistory === "undefined") || (this.routeHistory.length <= 1))
				return false;
			else
				return this.routeHistory[this.routeHistory.length-2];
		},

		trackPathName: function(e){
			if(_.last(this.pathHistory) != window.location.pathname)
				this.pathHistory.push(window.location.pathname);
		},

		//If the user or app cancelled the last route, call this function to revert
		// the window location pathname back to the correct value
		undoLastRoute: function(){
			this.routeHistory.pop();

			// Remove the last route and pathname from the history
			if(_.last(this.pathHistory) == window.location.pathname)
				this.pathHistory.pop();

			//Change the pathname in the window location back
			this.navigate(_.last(this.pathHistory), {replace: true});
		},

		renderIndex: function (param) {
			this.routeHistory.push("index");

			if(!MetacatUI.appView.indexView){
				require(["views/IndexView"], function(IndexView){
					MetacatUI.appView.indexView = new IndexView();
					MetacatUI.appView.showView(MetacatUI.appView.indexView);
				});
			}
			else
				MetacatUI.appView.showView(MetacatUI.appView.indexView);
		},

		renderText: function(options){
			if(!MetacatUI.appView.textView){
				require(['views/TextView'], function(TextView){
					MetacatUI.appView.textView = new TextView();
					MetacatUI.appView.showView(MetacatUI.appView.textView, options);
				});
			}
			else
				MetacatUI.appView.showView(MetacatUI.appView.textView, options);
		},

		renderHelp: function(page, anchorId){
			this.routeHistory.push("help");
			MetacatUI.appModel.set('anchorId', anchorId);

			if(page)
				var pageName = this.helpPages[page];
			else
				var pageName = this.helpPages["defaultPage"]; //default

			var options = {
				pageName: pageName,
				anchorId: anchorId
			}

			this.renderText(options);
		},

		renderAbout: function (anchorId) {
			this.routeHistory.push("about");
			MetacatUI.appModel.set('anchorId', anchorId);
			var options = {
					pageName: "about",
					anchorId: anchorId
				}

			this.renderText(options);
		},

		renderAPI: function (anchorId) {
			this.routeHistory.push("api");
			MetacatUI.appModel.set('anchorId', anchorId);
			var options = {
					pageName: "api",
					anchorId: anchorId
				}

			this.renderText(options);
		},

		/*
    * Renders the editor view given a root package identifier,
    * or a metadata identifier.  If the latter, the corresponding
    * package identifier will be queried and then rendered.
    */
		renderEditor: function (pid) {

			//If there is no EditorView yet, create one
			if( ! MetacatUI.appView.editorView ){

				var router = this;

				//Load the EditorView file
				require(['views/EditorView'], function(EditorView) {
					//Add the submit route to the router history
					router.routeHistory.push("submit");

					//Create a new EditorView
					MetacatUI.appView.editorView = new EditorView({pid: pid});

					//Set the pid from the pid given in the URL
					MetacatUI.appView.editorView.pid = pid;

					//Render the EditorView
					MetacatUI.appView.showView(MetacatUI.appView.editorView);
				});

			}
			else {

					//Set the pid from the pid given in the URL
					MetacatUI.appView.editorView.pid = pid;

					//Add the submit route to the router history
					this.routeHistory.push("submit");

					//Render the Editor View
					MetacatUI.appView.showView(MetacatUI.appView.editorView);

			}
		},

		renderMdqRun: function (suiteId, pid) {
			this.routeHistory.push("quality");

			if (!MetacatUI.appView.mdqRunView) {
				require(["views/MdqRunView"], function(MdqRunView) {
					MetacatUI.appView.mdqRunView = new MdqRunView();
					MetacatUI.appView.mdqRunView.suiteId = suiteId;
					MetacatUI.appView.mdqRunView.pid = pid;
					MetacatUI.appView.showView(MetacatUI.appView.mdqRunView);
				});
			} else {
				MetacatUI.appView.mdqRunView.suiteId = suiteId;
				MetacatUI.appView.mdqRunView.pid = pid;
				MetacatUI.appView.showView(MetacatUI.appView.mdqRunView);
			}
		},

		renderTools: function (anchorId) {
			this.routeHistory.push("tools");
			MetacatUI.appModel.set('anchorId', anchorId);

			var options = {
					pageName: "tools",
					anchorId: anchorId
				}

			this.renderText(options);
		},

		renderMyData: function(page){
			//Only display this is the user is logged in
			if(!MetacatUI.appUserModel.get("loggedIn") && MetacatUI.appUserModel.get("checked")) this.navigate("data", { trigger: true });
			else if(!MetacatUI.appUserModel.get("checked")){
				var router = this;

				this.listenToOnce(MetacatUI.appUserModel, "change:checked", function(){

					if(MetacatUI.appUserModel.get("loggedIn"))
						router.renderMyData(page);
					else
						this.navigate("data", { trigger: true });
				});

				return;
			}

			this.routeHistory.push("data");

			///Check for a page URL parameter
			if(typeof page === "undefined")
				MetacatUI.appModel.set("page", 0);
			else
				MetacatUI.appModel.set('page', page);

			if(!MetacatUI.appView.dataCatalogView){
				require(['views/DataCatalogView'], function(DataCatalogView){
					MetacatUI.appView.dataCatalogView = new DataCatalogView();
					MetacatUI.appView.dataCatalogView.searchModel = MetacatUI.appUserModel.get("searchModel").clone();
					MetacatUI.appView.showView(MetacatUI.appView.dataCatalogView);
				});
			}
			else{
				MetacatUI.appView.dataCatalogView.searchModel = MetacatUI.appUserModel.get("searchModel").clone();
				MetacatUI.appView.showView(MetacatUI.appView.dataCatalogView);
			}
		},

		renderData: function (mode, query, page) {
			this.routeHistory.push("data");

			///Check for a page URL parameter
			if((typeof page === "undefined") || !page)
				MetacatUI.appModel.set("page", 0);
			else if(page == 0)
				MetacatUI.appModel.set('page', 0);
			else
				MetacatUI.appModel.set('page', page-1);

			//Check for a query URL parameter
			if((typeof query !== "undefined") && query){
				var customQuery = MetacatUI.appSearchModel.get('additionalCriteria');
				customQuery.push(query);
				MetacatUI.appSearchModel.set('additionalCriteria', customQuery);
			}

			if(!MetacatUI.appView.dataCatalogView){
				require(['views/DataCatalogView'], function(DataCatalogView){
					MetacatUI.appView.dataCatalogView = new DataCatalogView();

					//Check for a search mode URL parameter
					if((typeof mode !== "undefined") && mode)
						MetacatUI.appView.dataCatalogView.mode = mode;

					MetacatUI.appView.showView(MetacatUI.appView.dataCatalogView);
				});
			}
			else{
				//Check for a search mode URL parameter
				if((typeof mode !== "undefined") && mode)
					MetacatUI.appView.dataCatalogView.mode = mode;

				MetacatUI.appView.showView(MetacatUI.appView.dataCatalogView);
			}
		},

		renderMetadata: function (pid) {
			this.routeHistory.push("metadata");
			MetacatUI.appModel.set('lastPid', MetacatUI.appModel.get("pid"));

			var seriesId;

			//Check for a seriesId
			if(MetacatUI.appModel.get("useSeriesId") && (pid.indexOf("version:") > -1)){
				seriesId = pid.substr(0, pid.indexOf(", version:"));

				pid = pid.substr(pid.indexOf(", version: ") + ", version: ".length);
			}

			//Save the id in the app model
			MetacatUI.appModel.set('pid', pid);

			if(!MetacatUI.appView.metadataView){
				require(['views/MetadataView'], function(MetadataView){
					MetacatUI.appView.metadataView = new MetadataView();

					//Send the id(s) to the view
					MetacatUI.appView.metadataView.seriesId = seriesId;
					MetacatUI.appView.metadataView.pid = pid;

					MetacatUI.appView.showView(MetacatUI.appView.metadataView);
				});
			}
			else{
				//Send the id(s) to the view
				MetacatUI.appView.metadataView.seriesId = seriesId;
				MetacatUI.appView.metadataView.pid = pid;

				MetacatUI.appView.showView(MetacatUI.appView.metadataView);
			}
		},

		renderProfile: function(username, section, subsection){
			this.closeLastView();

			var viewChoice;

			if(!username || !MetacatUI.appModel.get("userProfiles")){
				this.routeHistory.push("summary");

				if(!MetacatUI.appView.statsView){
					require(["views/StatsView"], function(StatsView){
						MetacatUI.appView.statsView = new StatsView();

						MetacatUI.appView.showView(MetacatUI.appView.statsView);
					});
				}
				else
					MetacatUI.appView.showView(MetacatUI.appView.statsView);
			}
			else{
				this.routeHistory.push("profile");
				MetacatUI.appModel.set("profileUsername", username);

				if(section || subsection){
					var viewOptions = { section: section, subsection: subsection }
				}

				if(!MetacatUI.appView.userView){

					require(['views/UserView'], function(UserView){
						MetacatUI.appView.userView = new UserView();

						MetacatUI.appView.showView(MetacatUI.appView.userView, viewOptions);
					});
				}
				else
					MetacatUI.appView.showView(MetacatUI.appView.userView, viewOptions);
			}
		},

		renderMyProfile: function(section, subsection){
			if(MetacatUI.appUserModel.get("checked") && !MetacatUI.appUserModel.get("loggedIn"))
				this.renderSignIn();
			else if(!MetacatUI.appUserModel.get("checked")){
				this.listenToOnce(MetacatUI.appUserModel, "change:checked", function(){
					if(MetacatUI.appUserModel.get("loggedIn"))
						this.renderProfile(MetacatUI.appUserModel.get("username"), section, subsection);
					else
						this.renderSignIn();
				});
			}
			else if(MetacatUI.appUserModel.get("checked") && MetacatUI.appUserModel.get("loggedIn")){
				this.renderProfile(MetacatUI.appUserModel.get("username"), section, subsection);
			}
		},

		logout: function (param) {
			//Clear our browsing history when we log out
			this.routeHistory.length = 0;

			if(((typeof MetacatUI.appModel.get("tokenUrl") == "undefined") || !MetacatUI.appModel.get("tokenUrl")) && !MetacatUI.appView.registryView){
				require(['views/RegistryView'], function(RegistryView){
					MetacatUI.appView.registryView = new RegistryView();
					if(MetacatUI.appView.currentView.onClose)
						MetacatUI.appView.currentView.onClose();
					MetacatUI.appUserModel.logout();
				});
			}
			else{
				if(MetacatUI.appView.currentView && MetacatUI.appView.currentView.onClose)
					MetacatUI.appView.currentView.onClose();
				MetacatUI.appUserModel.logout();
			}
		},

		renderSignIn: function(){

			var router = this;

			//If there is no SignInView yet, create one
			if(!MetacatUI.appView.signInView){
				require(['views/SignInView'], function(SignInView){
					MetacatUI.appView.signInView = new SignInView({ el: "#Content", fullPage: true });
					router.renderSignIn();
				});

				return;
			}

			//If the user status has been checked and they are already logged in, we will forward them to their profile
			if( MetacatUI.appUserModel.get("checked") && MetacatUI.appUserModel.get("loggedIn") ){
				this.navigate("my-profile", { trigger: true });
				return;
			}
			//If the user status has been checked and they are NOT logged in, show the SignInView
			else if( MetacatUI.appUserModel.get("checked") && !MetacatUI.appUserModel.get("loggedIn") ){
				this.routeHistory.push("signin");
				MetacatUI.appView.showView(MetacatUI.appView.signInView);
			}
			//If the user status has not been checked yet, wait for it
			else if( !MetacatUI.appUserModel.get("checked") ){
				this.listenToOnce(MetacatUI.appUserModel, "change:checked", this.renderSignIn);
			}
		},

		renderSignInSuccess: function(){

			$("body").html("Sign-in successful.");
			setTimeout(window.close, 1000);
		},

		renderLdapSignInSuccess: function(){

			//If there is an LDAP sign in error message
			if(window.location.pathname.indexOf("error=Unable%20to%20authenticate%20LDAP%20user") > -1){
				this.renderLdapOnlySignInError();
			}
			else{
				this.renderSignInSuccess();
			}

		},

		renderLdapSignInError: function(){
			this.routeHistory.push("signinldaperror");

			if(!MetacatUI.appView.signInView){
				require(['views/SignInView'], function(SignInView){
					MetacatUI.appView.signInView = new SignInView({ el: "#Content"});
					MetacatUI.appView.signInView.ldapError = true;
					MetacatUI.appView.signInView.ldapOnly = true;
					MetacatUI.appView.signInView.fullPage = true;
					MetacatUI.appView.showView(MetacatUI.appView.signInView);
				});
			}
			else{
				MetacatUI.appView.signInView.ldapError = true;
				MetacatUI.appView.signInView.ldapOnly = true;
				MetacatUI.appView.signInView.fullPage = true;
				MetacatUI.appView.showView(MetacatUI.appView.signInView);
			}
		},

		renderLdapOnlySignInError: function(){
			this.routeHistory.push("signinldaponlyerror");

			if(!MetacatUI.appView.signInView){

				require(['views/SignInView'], function(SignInView){
					var signInView = new SignInView({ el: "#Content"});
					signInView.ldapError = true;
					signInView.ldapOnly = true;
					signInView.fullPage = true;
					MetacatUI.appView.showView(signInView);
				});

			}
			else{

				var signInView = new SignInView({ el: "#Content"});
				signInView.ldapError = true;
				signInView.ldapOnly = true;
				signInView.fullPage = true;
				MetacatUI.appView.showView(signInView);

			}
		},

		renderLdapSignIn: function(){

			this.routeHistory.push("signinLdap");

			if(!MetacatUI.appView.signInView){
				require(['views/SignInView'], function(SignInView){
					MetacatUI.appView.signInView = new SignInView({ el: "#Content"});
					MetacatUI.appView.signInView.ldapOnly = true;
					MetacatUI.appView.signInView.fullPage = true;
					MetacatUI.appView.showView(MetacatUI.appView.signInView);
				});
			}
			else{
				var signInLdapView = new SignInView({ el: "#Content"});
				MetacatUI.appView.signInView.ldapOnly = true;
				MetacatUI.appView.signInView.fullPage = true;
				MetacatUI.appView.showView(signInLdapView);
			}

		},

		renderExternal: function(url) {
			// use this for rendering "external" content pulled in dynamically
			this.routeHistory.push("external");

			if(!MetacatUI.appView.externalView){
				require(['views/ExternalView'], function(ExternalView){
					MetacatUI.appView.externalView = new ExternalView();
					MetacatUI.appView.externalView.url = url;
					MetacatUI.appView.showView(MetacatUI.appView.externalView);
				});
			}
			else{
				MetacatUI.appView.externalView.url = url;
				MetacatUI.appView.showView(MetacatUI.appView.externalView);
			}
		},

		navigateToDefault: function(){
			//Navigate to the default view
			this.navigate(MetacatUI.appModel.defaultView, {trigger: true});
		},

		/*
		* Gets an array of route names that are set on this router.
		* @return {Array} - An array of route names, not including any special characters
		*/
		getRouteNames: function(){

			var router = this;

		  var routeNames = _.map(Object.keys(this.routes), function(routeName){

				return router.getRouteName(routeName);

			});

			//The "view" route is not included in the route hash (it is set up during initialize),
			// so we have to manually add it here.
			routeNames.push("view");

			return routeNames;

		},

		/*
		* Gets the route name based on the route pattern given
		* @param {string} routePattern - A string that represents the route pattern e.g. "view(/pid)"
		* @return {string} - The name of the route without any pattern special characters e.g. "view"
		*/
		getRouteName: function(routePattern){

			var specialChars = ["/", "(", "*", ":"];

			_.each(specialChars, function(specialChar){

				var substring = routePattern.substring(0, routePattern.indexOf(specialChar));

				if( substring && substring.length < routePattern.length ){
					routePattern = substring;
				}

			});

			return routePattern;

		},

		closeLastView: function(){
			//Get the last route and close the view
			var lastRoute = _.last(this.routeHistory);

			if(lastRoute == "summary")
				MetacatUI.appView.statsView.onClose();
			else if(lastRoute == "profile")
				MetacatUI.appView.userView.onClose();
		},

		clearJSONLD: function() {
			$("#jsonld").remove();
		},

		clearHighwirePressMetaTags: function() {
			$("head > meta[name='citation_title']").remove()
			$("head > meta[name='citation_authors']").remove()
			$("head > meta[name='citation_publisher']").remove()
			$("head > meta[name='citation_date']").remove()
		}

	});

	return UIRouter;
});
