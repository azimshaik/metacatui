/*global define */
define(['jquery', 'underscore', 'backbone'], 				
	function($, _, Backbone) {
	'use strict';

	// Application Model
	// ------------------
	var AppModel = Backbone.Model.extend({
		// This model contains all of the attributes for the Application
		defaults: {
			headerType: 'default',
			title: window.themeTitle || "Metacat Data Catalog",
			searchMode: 'map',
			username: null,
			fullName: null,
			sortOrder: 'dateUploaded+desc',
			pid: null,
			anchorId: null,
			page: null,
			baseUrl: "https://cn-sandbox-2.test.dataone.org", //window.location.origin,
			// the most likely item to change is the Metacat deployment context
			context: '',
			d1Service: 'cn/v2',
			viewServiceUrl: null,
			packageServiceUrl: null,
			publishServiceUrl: null,
			authServiceUrl: null,
			queryServiceUrl: null,
			metaServiceUrl: null,
			registryServiceUrl: null,
			ldapwebServiceUrl: null,
			metacatServiceUrl: null,
			objectServiceUrl: null,
			d1LogServiceUrl: null,
			nodeServiceUrl: null,
			// NOTE: include your bioportal apikey for suggested classes
			// see: http://bioportal.bioontology.org/account
			bioportalServiceUrl: "https://data.bioontology.org/search?ontologies=D1-CARBON-FLUX&apikey=24e4775e-54e0-11e0-9d7b-005056aa3316&pagesize=1000&suggest=true&q=",
			orcidServiceUrl: "https://pub.orcid.org/v1.1/search/orcid-bio?q=",
			tokenUrl: null,
			annotatorUrl: null
		},

		provDev: false,
		
		defaultView: "data",

		
		initialize: function() {
			
			//For IE
			if (!window.location.origin) {
				var baseUrl = window.location.protocol + "//" + window.location.host;
				
				this.set('baseUrl', baseUrl);
			}
			
						
			// these are pretty standard, but can be customized if needed
			//this.set('viewServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/views/metacatui/');
			//this.set('packageServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/package/');
			//this.set('publishServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/publish/');
			this.set('authServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/isAuthorized/');
			this.set('queryServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/query/solr/?');
			this.set('metaServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/meta/');
			this.set('objectServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/resolve/');
			//this.set('registryServiceUrl', this.get('baseUrl') + this.get('context') + '/cgi-bin/register-dataset.cgi');
			//this.set('ldapwebServiceUrl', this.get('baseUrl') + this.get('context') + '/cgi-bin/ldapweb.cgi');
			//this.set('metacatServiceUrl', this.get('baseUrl') + this.get('context') + '/metacat');
			this.set('nodeServiceUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/node');
			
			//this.set('d1LogServiceUrl', this.get('baseUrl') + this.get('d1Service') + 'logsolr');
			this.set('d1LogServiceUrl', this.get('baseUrl') + '/solr/d1-cn-log/select/?');
			
			// use portal to  retrieve token and annotate metadata
			this.set('tokenUrl', this.get('baseUrl') + '/portal/identity?action=getToken');
			this.set('annotatorUrl', this.get('baseUrl') + '/portal/annotator');
			//this.set('tokenUrl', this.get('baseUrl') + this.get('context') + this.get('d1Service') + '/token');
			//this.set('annotatorUrl', this.get('baseUrl') + this.get('context') + '/annotator');

			
		}
	
		
	});
	return AppModel;		
});
