/*global define */
define(['jquery', 'underscore', 'backbone'],
    function($, _, Backbone) {
    'use strict';

    // Metric Model
    // -------------
    var Metrics = Backbone.Model.extend({
        defaults: {
            metricRequest: null,
            startDate: null,
            endDate: null,
            results: null,
            resultDetails: null,
            pid_list: null,
            url: null,
            filterType: null,

            // metrics and metric Facets returned as response from the user
            // datatype: array
            citations: null,
            views: null,
            downloads: null,
            months: null,
            country: null,
            years: null,
            repository: null,
            award: null,
            datasets: null,


            // Total counts for metrics
            totalCitations: null,
            totalViews: null,
            totalDownloads: null,


            metricsRequiredFields: {
                metricName: true,
                pid_list: true
            }
        },


        metricRequest: {
            "metricsPage": {
                "total": 0,
                "start": 0,
                "count": 0
            },
            "metrics": [
                "citations",
                "downloads",
                "views"
            ],
            "filterBy": [
                {
                    "filterType": "",
                    "values": [],
                    "interpretAs": "list"
                },
                {
                    "filterType": "month",
                    "values": [],
                    "interpretAs": "range"
                }
            ],
            "groupBy": [
                "month"
            ]
        },

        // Initializing the Model objects pid and the metricName variables.
        initialize: function(options) {
            if(!(options.pid == 'undefined')) {
                this.pid_list = options.pid_list;
                this.filterType = options.type;
            }
            // url for the model that is used to for the fetch() call
            this.url = MetacatUI.appModel.get("metricsUrl");
        },

        // Overriding the Model's fetch function.
        fetch: function(){
          var fetchOptions = {};
          this.metricRequest.filterBy[0].filterType = this.filterType;
          this.metricRequest.filterBy[0].values = this.pid_list;

          // TODO: Set the startDate and endDate based on the datePublished and current date
          // respctively.
          this.metricRequest.filterBy[1].values = [];
          this.metricRequest.filterBy[1].values.push("01/01/2000");
          this.metricRequest.filterBy[1].values.push(this.getCurrentDate());

          // HTTP GET
          fetchOptions = _.extend({data:"metricsRequest="+JSON.stringify(this.metricRequest), timeout:50000});
          // Uncomment to set it as a HTTP POST
          // fetchOptions = _.extend({data:JSON.stringify(this.metricRequest), type="POST"});

          //This calls the Backbone fetch() function but with our custom fetch options.
          return Backbone.Model.prototype.fetch.call(this, fetchOptions);
        },

        getCurrentDate: function() {
            var today = new Date();
            var dd = today.getDate();
            var mm = today.getMonth()+1; //January is 0!

            var yyyy = today.getFullYear();
            if(dd<10){
                dd='0'+dd;
            }
            if(mm<10){
                mm='0'+mm;
            }
            var today = mm+'/'+dd+'/'+yyyy;
            return today;
        },

        // Parsing the response for setting the Model's member variables.
        parse: function(response){

            return {
                "metricRequest": response.metricsRequest,
                "citations": response.results.citations,
                "views": response.results.views,
                "downloads": response.results.downloads,
                "months": response.results.months,
                "country": response.results.country,
                "resultDetails": response.resultDetails,
                "datasets": response.results.datasets
            }
        }

    });
    return Metrics;
});
