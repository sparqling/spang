const request = require('request')

let bodies = [];

module.exports = (endpoint, query, format, auth, callback) => {
  bodies = [];
  queryAll(endpoint, query, format, auth, 0, 0, callback);
}


function queryOnce(endpoint, query, format, auth, callback) {
  const options = {
    uri: endpoint, 
    followAllRedirects: true,
    headers:{ 
      "Content-type": 'application/json'
    },
    body: query
  };
  if (auth.hasOwnProperty('user') && auth.hasOwnProperty('password')) {
    options.auth = auth;
  }

  afterRequest = (error, response, body) => {
    // if(response.headers)
    //   callback(response.headers['x-sparql-maxrows'], error, response, body);
    // else
      callback(null, error, response, body);
  }

  request.post(options, afterRequest);
};

function queryAll(endpoint, query, format, auth, currentOffset, pageSize, callback) {
  let currentQuery = query;
  
  if(pageSize > 0) {
    currentQuery += ` LIMIT ${pageSize}`;
  }
  if(currentOffset > 0) {
    currentQuery += ` OFFSET ${currentOffset}`;
  }
  queryOnce(endpoint, currentQuery, format, auth, (maxrows, error, response, body) => {
    if(error || response.statusCode != 200) {
      callback(error, response.statusCode, bodies);
    } else {
      bodies.push(body);
      if(maxrows) {
        maxrows = parseInt(maxrows);
        console.error(`Query next page (from ${currentOffset + maxrows})...`);
        queryAll(endpoint, query, format, auth, currentOffset + maxrows, maxrows, callback);
      } else {
        callback(false, 200, bodies);
      }
    }
  });
};
