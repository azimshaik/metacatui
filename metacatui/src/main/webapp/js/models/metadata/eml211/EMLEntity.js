define(["jquery", "underscore", "backbone"],
    function($, _, Backbone) {

        /*
         * EMLEntity represents an abstract data entity, corresponding
         * with the EML EntityGroup and other elements common to all
         * entity types, including otherEntity, dataTable, spatialVector,
         * spatialRaster, and storedProcedure
         *
         * @see https://github.com/NCEAS/eml/blob/master/eml-entity.xsd
         */
        var EMLEntity = Backbone.Model.extend({

            /* Attributes of any entity */
            defaults: {

                /* Attributes from EML */
                xmlID: null, // The XML id of the entity
                alternateIdentifier: [], // Zero or more alt ids
                entityName: null, // Required, the name of the entity
                entityDescription: null, // Description of the entity
                physical: [], // Zero to many EMLPhysical objects
                coverage: [], // Zero to many EML{Geo|Taxon|Temporal}Coverage objects
                methods: null, // Zero or one EMLMethod object
                additionalInfo: [], // Zero to many EMLText objects
                attributeList: [], // Zero to many EMLAttribute objects
                constraint: [], // Zero to many EMLConstraint objects
                references: null, // A reference to another EMLEntity by id (needs work)

                /* Attributes not from EML */
                parentModel: null, // The parent model this entity belongs to
                objectXML: null, // The serialized XML of this EML entity
                objectDOM: null  // The DOM of this EML entity
            },

            /*
             * The map of lower case to camel case node names
             * needed to deal with parsing issues with $.parseHTML().
             * Use this until we can figure out issues with $.parseXML().
             */
            nodeNameMap: {
                "alternateidentifier": "alternateIdentifier",
                "entityname": "entityName",
                "entitydescription": "entityDescription",
                "additionalinfo": "additionalInfo",
                "attributelist": "attributeList"
            },

            /* Initialize an EMLEntity object */
            initialize: function(attributes) {
                if ( attributes && attributes.objectDOM) {
                    this.set(this.parse(attributes.objectDOM));
                }

                this.on(
                    "change:alternateIdentifier " +
                    "change:entityName " +
                    "change:entityDescription " +
                    "change:physical " +
                    "change:coverage " +
                    "change:methods " +
                    "change:additionalInfo " +
                    "change:attributeList " +
                    "change:constraint " +
                    "change:references",
                    this.trickleUpChange);
            },

            /*
             * Parse the incoming entity's common XML elements
             * Content example:
             * <otherEntity>
             *     <alternateIdentifier>file-alt.1.1.txt</alternateIdentifier>
             *     <alternateIdentifier>file-again.1.1.txt</alternateIdentifier>
             *     <entityName>file.1.1.txt</entityName>
             *     <entityDescription>A file summary</entityDescription>
             * </otherEntity>
             */
            parse: function(objectDOM) {
                var modelJSON  = {}; // the attributes to return
                var $objectDOM;

                // Use the cached object if we have it
                if ( !objectDOM ) {
                    if ( this.get("objectDOM") ) {
                        objectDOM = this.get("objectDOM");

                    } else {
                        return {};
                    }
                }

                $objectDOM = $(objectDOM);

                // Add the XML id
                modelJSON.xmlID = $objectDOM.attr("id");

                // Add the alternateIdentifiers
                modelJSON.alternateidentifier = [];
                var alternateIds = $objectDOM.children("alternateidentifier");
                _.each(alternateIds, function(alternateId) {
                    modelJSON.alternateidentifier.push(alternateId.textContent);
                });

                // Add the entityName
                modelJSON.entityname = $objectDOM.children("entityname").text();

                // Add the entityDescription
                modelJSON.entitydescription = $objectDOM.children("entitydescription").text();

                // Add the entityType
                modelJSON.entitytype = $objectDOM.children("entitytype").text();

                return modelJSON;
            },

            /* Let the top level package know of attribute changes from this object */
            trickleUpChange: function(){
                MetacatUI.rootDataPackage.packageModel.set("changed", true);
            },

        });

        return EMLEntity;
    }
);