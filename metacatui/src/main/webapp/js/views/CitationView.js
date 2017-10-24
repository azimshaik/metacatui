define(['jquery', 'underscore', 'backbone', 'models/SolrResult'], 				
	function($, _, Backbone, SolrResult) {
	'use strict';

	
	var CitationView = Backbone.View.extend({
		
		type: "Citation",
		
		initialize: function(options){
			if((options === undefined) || (!options)) var options = {};
			
			this.id   		= options.id	 	 || null;
			this.attributes = options.attributes || null;
			this.className += options.className  || "";
			this.model 		= options.model 	 || null;
			this.metadata   = options.metadata	 || null;
			this.title      = options.title      || null;
			this.createLink = (options.createLink == false) ? false : true;
			this.createTitleLink = (options.createLink == false) ? false : true;
			
			//If a metadata doc was passed but no data or package model, then save the metadata as our model, too
			if(!this.model && this.metadata) this.model = this.metadata;			
			//If the model is a Package, then get the metadata doc in this package				
			else if(this.model && this.model.type == "Package") 
				this.metadata = this.model.getMetadata();
			//If the model is a metadata doc and there was no other metadata specified, then use the model
			else if(this.model && (this.model.get("formatType") == "METADATA") && !this.metadata) 
				this.metadata = this.model;			
		},
				
		tagName : "cite",
		
		className : "citation",
		
		/*
		 * Creates a citation
		 */
		render: function(){
			
			if (!this.model && !this.metadata && !this.id) 
				return this;	
			else if(!this.model && !this.metadata && this.pid){
				//Create a model
 				this.metadata = new SolrResult({id: this.pid});
 				this.model = this.metadata;
 				
 				//Retrieve the citation info for this model and render once we have it
 				var view = this;
 				this.model.on("change", function(){ view.render.call(view); });
 				this.model.getCitationInfo();			
 				return;
			}
 			else if(this.metadata && this.metadata.get("archived")){
 				this.$el.append('<span class="danger">This content has been archived. </span>');
 				
 				//The ID
 				var idEl = $(document.createElement("span")).addClass("id");
 				if(this.metadata.get("seriesId")){
 					$(idEl).text(this.metadata.get("seriesId") + ", version: " + this.metadata.get("id") + ". ");
 				}
 				else{
 			        $(idEl).text("" + this.metadata.get("id") + ". ");				
 				}
 				this.$el.append(idEl);
 				
 				return this;
 			}		 
			//Create the citation from the metadata doc if we have one
			else if (this.metadata) {
				
				//If this object is in progress of saving, don't RErender this view.
				if(this.metadata.get("uploadStatus") == "p" && this.$el.children().length)
					return;
					
				//Clear the element
				this.$el.html("");
				
				var pubDate = this.metadata.get("pubDate"),
					dateUploaded = this.metadata.get("dateUploaded"),
					title = Array.isArray(this.metadata.get("title")) ? (this.metadata.get("title")[0] || this.title || "") : this.metadata.get("title") || this.title || "",
					id = this.metadata.get("id"),
					seriesId = this.metadata.get("seriesId") || null,
					datasource = this.metadata.get("datasource");

				//Format the author text
				if(this.metadata.type == "EML"){
					var authors = this.metadata.get("creator"),
						count = 0,
						authorText = "";
					
					_.each(authors, function (author) {
						count++;
						
						if(count == 6){
	 		            	authorText += ", et al. ";
	 		            	return;
	 		            }
	 		            else if(count > 6) 
	 		            	return;
	 		            	
	 		            //Get the individual's name, or position name, or organization name, in that order
						var name = author.get("individualName") ? 
									_.flatten([author.get("individualName").givenName, author.get("individualName").surName]).join(" ") :
									author.get("positionName") || author.get("organizationName");
	 		             
						if(count > 1){
		 		            if(authors.length > 2) authorText += ",";
	
							if (count == authors.length) authorText += " and";
	
							if (authors.length > 1) authorText += " ";
						}

						authorText += name;

						if (count == authors.length) authorText += ". ";
					});
				}
				else{
					var authors = this.metadata.get("origin"),
						count = 0,
						authorText = "";

					_.each(authors, function (author) {
						count++;
						
						if(count == 6){
	 		            	authorText += ", et al. ";
	 		            	return;
	 		            }
	 		            else if(count > 6) 
	 		            	return;
	 		             
						if(count > 1){
		 		            if(authors.length > 2) authorText += ",";
	
							if (count == authors.length) authorText += " and";
	
							if (authors.length > 1) authorText += " ";
						}
						
						authorText += author;

						if (count == authors.length) authorText += ". ";
					});
				}
			}
			//If there is no metadata doc, then this is probably a data doc without science metadata. 
			//So create the citation from the index values
			else {
				var author = this.model.get("rightsHolder") || this.model.get("submitter") || "",
					dateUploaded = this.model.get("dateUploaded"),
					id = this.model.get("id"),
					datasource = this.model.get("datasource");

				//Format the author text
				var authorText = author ? author.substring(3, author.indexOf(",O=")) + ". " : "";
			}

			//The author
			var authorEl = $(document.createElement("span")).addClass("author").text(authorText);

			//The publication date
			var pubDateText = "";
			if ((typeof pubDate !== "undefined") && pubDate) {
				var pubDateFormatted = new Date(pubDate).getUTCFullYear();
				if (!isNaN(pubDateFormatted)) pubDateText += pubDateFormatted;
			}
			if (dateUploaded && (isNaN(pubDateFormatted) || !pubDate)) {
				var dateUploadedFormatted = new Date(dateUploaded).getFullYear();
				if (!isNaN(dateUploadedFormatted)) pubDateText += dateUploadedFormatted;
			}
			var pubDateEl = $(document.createElement("span")).addClass("pubdate")

			// Only set text if we have a non-zero-length pubDate string
			if (pubDateText.length > 0) {
				pubDateEl.text(pubDateText + ". ");
			}

			//The publisher (source member node)
			var publisherText = "";
			if (typeof datasource !== "undefined" && datasource) {
				var memberNode = MetacatUI.nodeModel.getMember(datasource);
								
				if(memberNode) 
  					publisherText = memberNode.name + ". "; 
  				else
  					publisherText = datasource + ". "; 
			}
			else{
				var memberNode = MetacatUI.nodeModel.getMember(MetacatUI.nodeModel.get("currentMemberNode"));
				
				if(memberNode) 
  					publisherText = memberNode.name + ". ";
			}
			
			var publisherEl = $(document.createElement("span")).addClass('publisher');

			// Only set text if we have a non-zero-length publisherText string
			if (publisherText) {
				publisherEl.text(publisherText);
			}

			//The ID
			var idEl = $(document.createElement("span")).addClass("id");
			if (seriesId) {
				$(idEl).text(seriesId + ", version: " + id + ". ");
			}
			else {
				$(idEl).text("" + id + ". ");
			}

			if ((typeof title !== "undefined") && title){
				if(title.trim().charAt(title.length-1) != ".")
					title = title.trim() + ". ";
				else
					title = title.trim() + " ";
				
				var titleEl = $(document.createElement("span")).addClass("title").attr("data-id", id).text(title);
			}
			else
				var titleEl = document.createElement("span");
			
			//Create a link and put all the citation parts together
			if (this.createLink){
				var linkEl = $(document.createElement("a"))
								.addClass("route-to-metadata")
								.attr("data-id", id)
								.attr("href", "#view/" + id)
								.append(authorEl, pubDateEl, titleEl, publisherEl, idEl);
				this.$el.append(linkEl);
			}
			else if(this.createTitleLink){
				var linkEl = $(document.createElement("a"))
								.addClass("route-to-metadata")
								.attr("data-id", id)
								.attr("href", "#view/" + id)
								.append(titleEl);
				this.$el.append(authorEl, pubDateEl, linkEl, publisherEl, idEl);
			}
			else{
				this.$el.append(authorEl, pubDateEl, titleEl, publisherEl, idEl);
			}
		
			this.setUpListeners();
			
			return this;
		},
		
		setUpListeners: function(){
			if (!this.metadata) return;
			
			this.stopListening();
			
			//If anything in the model changes, rerender this citation
			this.listenTo(this.metadata, "change:origin change:creator change:pubDate change:dateUploaded change:title change:seriesId change:id change:datasource", this.render);

			//If this model is an EML211 model, then listen differently
			if(this.metadata.type == "EML"){
				var creators = this.metadata.get("creator");
				
				//Listen to the names
				for(var i=0; i<creators.length; i++){
					this.listenTo(creators[i], "change:individualName change:organizationName change:positionName", this.render);
				}
				
			}
		},
		
		routeToMetadata: function(e){
			var id = this.model.get("id");
			
			//If the user clicked on a download button or any element with the class 'stop-route', we don't want to navigate to the metadata
			if ($(e.target).hasClass('stop-route') || (typeof id === "undefined") || !id)
				return;
			
			MetacatUI.uiRouter.navigate('view/'+id, {trigger: true});
		}
	});
	
	return CitationView;
});