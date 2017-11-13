'use strict';

const logger = require('winston');
const elasticsearch = require('elasticsearch');

/**
 * test query: http://localhost:3030/search?token=bird
 * 
 * 
 * https://gist.github.com/StephanHoyer/b9cd6cbc4cc93cee8ea6
 * 
 * 
 */
class ElasticsearchWrapper {

  setApp(app) {
    this.app = app;

    const contributionService = app.service('contributions');
    logger.info("ES Wrapper setup");
    logger.info("contibutionService:" + contributionService);
  }


  async add(contribution) {
    if (!contribution._id) {
      logger.info("add contribution - no id - skip");
      return;
    }
    let client = this.getClient();
    logger.info("ES001 add contribution: " + JSON.stringify(contribution));

    let addResult = "";
    try {
       addResult = await client.create({
        index: 'hc',
        type: 'contribution',
        id: ""+contribution._id,
        body: {
          title: contribution.title,//use title in order to find a contribution
          content: contribution.content,//
          value: contribution
        }
      });
      logger.info("ES001 add result:" + JSON.stringify(addResult));
    } catch (error) {
      logger.error("Add Contribution error: " + error);
      update(contribution);
    }
    return addResult;
  }

  async update(contribution) {
     if (!contribution._id) {
      logger.info("ES001 update contribution -  no id - skip");
      return;
    }

    logger.info("ES001 update contribution: " + JSON.stringify(contribution));
    
    try {

      
      let client = this.getClient();

      let deleteResult = await client.delete({
         index: 'hc',
         type: 'contribution',
         id: ""+contribution._id,
      });

      let updateResult = await client.update({
         index: 'hc',
         type: 'contribution',
         id: ""+contribution._id,
         
         _source : JSON.stringify(contribution)
         
      });
      logger.info("ES001 update result:" + JSON.stringify(updateResult));
    } catch (error) {
      logger.error("update ES error:" + error)
    }
    
  }





  async find(params) {
    logger.info('SearchService.find');

    //TODO RB: use paging in es

    //find by params:{"query":{"$skip":0,"$sort":{"createdAt":-1},"$search":"et"},"provider":"socketio"}
    logger.info('ES001 find by params:' + JSON.stringify(params));
    let token = params.query.$search;
    //let token = params.query.token;
    logger.info('ES001 token:' + token);

    if (!token) {
      return this.getNoResultsFoundResponse();
    }

    //START SEARCH
    let client = this.getClient();

    let query = this.buildQuery(token);

    // TODO RB: filter results
    // TODO RB: using paging
    // https://www.elastic.co/guide/en/elasticsearch/guide/current/pagination.html

    let result = await client.search(query);
    logger.info("ES001 search result:" + JSON.stringify(result));
    let totalHits = result.hits.total;
    logger.info("ES001 total hits:" + totalHits);
    if (totalHits === 0) {
      result = this.getNoResultsFoundResponse();
    } else {

      let value = this.getNoResultsFoundResponse();
      value.total = result.hits.total;

      logger.info("ES001 hits.hits: " + JSON.stringify(result.hits.hits));
      logger.info("ES001 hits.hits.length: " + result.hits.hits.length);

      for (var i = 0; i < result.hits.hits.length; i++) {
        value.data[i] = result.hits.hits[i]._source.value;
      }



      logger.info("ES001 result value:" + JSON.stringify(value));
      result = value;

    }
    return result;


  }

  getNoResultsFoundResponse() {
    let result = {
      total: 0,
      limit: 10,
      skip: 0,
      data: []
    }
    return result;
  }

  insert(contribution, onResponse, onError) {
    let client = this.getClient();

    let creationDate = Date.now;

    client.create({
      index: 'hc',
      type: 'contribition',
      id: contribution.title,
      body: {
        title: contribution.title,
        content: contribution.content,
        user_id: contribution.user,
        date: creationDate
      }
    }, function (error, response) {
      logger.debug('response:', JSON.stringify(response));
      onResponse(response);
      onError(error);

      client.close();
    });
  }

  dropIndex() {
    let client = this.getClient();
    client.indices.exists('hc', function (response) {
      logger.info('index exists: ' + response);
      logger.info('index exists: ' + JSON.stringify(response));
      return client.indices.delete({
        index: 'hc',
      });
    });

  }

  createIndex() {
    let client = this.getClient();
    return client.indices.create({
      index: 'hc',
      mapping: {
        contribution: {
          title: {
            type: 'string'
          }
        }
      }
    });
  }

  buildQuery(token) {
    let query = {
      index: 'hc',
      type: 'contribution',
      body: {
        query: {
          dis_max: {
            tie_breaker: 0.6,
            queries: [
              {
                fuzzy: {
                  title: {
                    value: token,
                    fuzziness: 'AUTO',
                    prefix_length: 0,
                    max_expansions: 20,
                    transpositions: false,
                    boost: 1.0
                  }
                }
              },
              {
                fuzzy: {
                  content: {
                    value: token,
                    fuzziness: 'AUTO',
                    prefix_length: 0,
                    max_expansions: 80,
                    transpositions: false,
                    boost: 1.0
                  }
                }
              }
            ],
            boost: 1.0
          }
        }
      }
    };

    return query;
  }

  getClient() {
    let client = new elasticsearch.Client({
      host: 'localhost:9200',
      apiVersion: '5.6',
      log: 'trace'
    });
    return client;
  }

  close(client) {
    client.close();
  }


} // end class



module.exports = ElasticsearchWrapper;
