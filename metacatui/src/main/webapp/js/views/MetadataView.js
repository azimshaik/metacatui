/*global define */
define(['jquery',
		'underscore', 
		'backbone',
		'text!templates/package.html',
		'text!templates/publishDOI.html',
		'text!templates/newerVersion.html'
		], 				
	function($, _, Backbone, PackageTemplate, PublishDoiTemplate, VersionTemplate) {
	'use strict';

	
	var MetadataView = Backbone.View.extend({

		el: '#Content',
		
		template: null,
				
		packageTemplate: _.template(PackageTemplate),

		doiTemplate: _.template(PublishDoiTemplate),
		
		versionTemplate: _.template(VersionTemplate),
		
		// Delegated events for creating new items, and clearing completed ones.
		events: {
			"click #publish": "publish"
		},
		
		initialize: function () {
			
		},
				
		// Render the main metadata view
		render: function () {

			console.log('Rendering the Metadata view');
			appModel.set('headerType', 'default');
			
			// get the pid to render
			var pid = appModel.get('pid');
			
			// load the document view from the server
			var endpoint = appModel.get('viewServiceUrl') + pid + ' #Metadata';
			console.log('calling view endpoint: ' + endpoint);

			var viewRef = this;
			this.$el.load(endpoint,
					function(response, status, xhr) {
				
						if (status == "error") {
							viewRef.showMessage(response);
						} else {
							viewRef.insertResourceMapLink(pid);
							viewRef.showLatestVersion(pid);
						}
						console.log('Loaded metadata, now fading in MetadataView');
						viewRef.$el.fadeIn('slow');
						
					});
			
			return this;
		},
		
		// this will insert the ORE package download link if available
		insertResourceMapLink: function(pid) {
			var resourceMap = [];
			// look up the resourceMapId[s]
			var queryServiceUrl = appModel.get('queryServiceUrl');
			var packageServiceUrl = appModel.get('packageServiceUrl');
			
			var viewRef = this;

			// surround pid value in "" so that doi characters do not affect solr query
			var query = 'fl=id,resourceMap&wt=xml&q=formatType:METADATA+-obsoletedBy:*+resourceMap:*+id:"' + pid + '"';
			$.get(
					queryServiceUrl + query,
					function(data, textStatus, xhr) {
						
						// the response should have a resourceMap element
						$(data).find("arr[name='resourceMap'] str").each(function(index, element) {
							var resourceMapId = $(this).text();
							resourceMap.push(resourceMapId);
							console.log('resourceMapId: ' + resourceMapId);
						}
						);
						
						if (resourceMap.length > 0) {														
							$("#downloadPackage").html(
								viewRef.packageTemplate({
									package_service: packageServiceUrl,
									resourceMap: resourceMap
								})
							);

						}
						
						// fetch the other parts to this section
						viewRef.insertDoiButton(pid);
						
					}
				);
				
		},
		
		// this will insert the DOI publish button
		insertDoiButton: function(pid) {
			
			// see if the user is authorized to update this object
			var authServiceUrl = appModel.get('authServiceUrl');

			// look up the SystemMetadata
			var metaServiceUrl = appModel.get('metaServiceUrl');

			// systemMetadata to render
			var identifier = null;
			var formatId = null;
			var size = null;
			var checksum = null;
			var rightsHolder = null;
			var submitter = null;
			
			var viewRef = this;
			
			// get the /meta for the pid
			$.get(
				metaServiceUrl + pid,
				function(data, textStatus, xhr) {
					
					// the response should have all the elements we want
					identifier = $(data).find("identifier").text();
					console.log('identifier: ' + identifier);
					formatId = $(data).find("formatId").text();
					size = $(data).find("size").text();
					checksum = $(data).find("checksum").text();
					rightsHolder = $(data).find("rightsHolder").text();
					submitter = $(data).find("submitter").text();

					if (identifier) {
						
						var populateTemplate = function(auth) {
							// TODO: include SystemMetadata details						
							viewRef.$el.find("#downloadPackage").append(
								viewRef.doiTemplate({
									isAuthorized: auth,
									identifier: identifier,
									formatId: formatId,
									size: size,
									checksum: checksum,
									rightsHolder: rightsHolder,
									submitter: submitter
								})
							);
						};
						
						// are we authorized to publish?
						$.ajax(
								{
									url: authServiceUrl + pid + "?action=changePermission",
									success: function(data, textStatus, xhr) {
										populateTemplate(true);
									},
									error: function(xhr, textStatus, errorThrown) {
										console.log('Not authorized to publish');
									}
							
								}
							);
					}
					
				}
			);
			
			
				
		},
		
		publish: function(event) {
			
			// target may not actually prevent click events, so double check
			var disabled = $(event.target).closest("a").attr("disabled");
			if (disabled) {
				return false;
			}
			var publishServiceUrl = appModel.get('publishServiceUrl');
			var pid = $(event.target).closest("a").attr("pid");
			var ret = confirm("Are you sure you want to publish " + pid + " with a DOI?");
			
			if (ret) {
				
				// show the progressbar
				this.showProgressBar();
				
				var identifier = null;
				var viewRef = this;
				$.ajax({
						url: publishServiceUrl + pid,
						type: "PUT",
						success: function(data, textStatus, xhr) {
							// the response should have new identifier in it
							identifier = $(data).find("identifier").text();
							console.log('identifier: ' + identifier);
							if (identifier) {
								
								var msg = "Published package '" + identifier + "'";
								viewRef.showMessage(msg, false, "alert-success");
								
								// navigate to the new view after a few seconds
								setTimeout(
										function() {
											// avoid a double fade out/in
											viewRef.$el.html('');
											viewRef.showProgressBar();
											uiRouter.navigate("view/" + identifier, {trigger: true})
										}, 
										3000);
							}
						},
						error: function(xhr, textStatus, errorThrown) {
							// show the error message, but stay on the same page
							var msg = $(xhr.responseText).find("description").text();
							viewRef.showMessage(msg, true, "alert-error");
						}
					}
				);
				
			}
		},
		
		// this will lookup the latest version of the PID
		showLatestVersion: function(pid, traversing) {
			var obsoletedBy = null;
			// look up the metadata
			var metaServiceUrl = appModel.get('metaServiceUrl');			

			// look up the meta
			var viewRef = this;
			$.get(
					metaServiceUrl + pid,
					function(data, textStatus, xhr) {
						
						// the response should have a resourceMap element
						obsoletedBy = $(data).find("obsoletedBy").text();
						console.log('obsoletedBy: ' + obsoletedBy);
						
						if (obsoletedBy) {						
							viewRef.showLatestVersion(obsoletedBy, true);
						} else {
							if (traversing) {
								viewRef.$el.find("#Metadata > .container").prepend(
										viewRef.versionTemplate({pid: pid})
										);
								
							}
							
						}
					}
				);
				
		},
		
		showMessage: function(msg, prepend, alertType) {
			this.hideProgressBar();
			var alertClass = "alert";
			if (alertType) {
				alertClass += " " + alertType;
			}
			var content = '<section id="Notification"><div class="' + alertClass + '"><h4>' + msg + '</h4></div></section>';
			if (prepend) {
				this.$el.prepend(content);
			} else {
				this.$el.html(content);
			}

		},
		
		showProgressBar: function() {
			this.hideProgressBar();
			this.scrollToTop();
			this.$el.prepend('<section id="Notification"><div class="progress progress-striped active"><div class="bar" style="width: 100%"></div></div></section>');
		},
		
		hideProgressBar: function() {
			$("#Notification").remove();
		},
		
		scrollToTop: function() {
			$("html, body").animate({ scrollTop: 0 }, "slow");
			return false;
		},
		
		onClose: function () {			
			console.log('Closing the metadata view');
		}				
	});
	return MetadataView;		
});
