const request = require('request')
const version = require("../package.json").version;
const acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  "tsv"      : "application/sparql-results+json", // receive as json and format to tsv afterward
  "text/tsv" : "text/tab-separated-values",
  "n-triples": "text/plain",
  "nt"       : "text/plain",
  "n3"       : "text/rdf+n3",
  "html"     : "text/html",
  "bool"     : "text/boolean",
  "turtle"   : "application/x-turtle",
  "ttl"      : "application/x-turtle",
  "rdf/xml"  : "application/rdf+xml",
  "rdfxml"   : "application/rdf+xml",
  "rdfjson"  : "application/rdf+json",
  "rdfbin"   : "application/x-binary-rdf",
  "rdfbint"  : "application/x-binary-rdf-results-table",
  "js"       : "application/javascript",
};

let bodies = [];

module.exports = (endpoint, query, format, byGet, callback) => {
  bodies = [];
  queryAll(endpoint, query, format, byGet, 0, 0, callback);
}


function queryOnce(endpoint, query, format, byGet, callback) {
  const accept = acceptHeaderMap[format];
  const options = {
    uri: endpoint, 
    followAllRedirects: true,
    headers:{ 
      "User-agent": `SPANG/${version}`, 
      "Accept": accept
    }
  };

  afterRequest = (error, response, body) => {
    if (error !== null) {
      console.error(error);
      return(false);
    }
    if(response && response.headers)
      callback(response.headers['x-sparql-maxrows'], error, response, body);
    else
      callback(null, error, response, body);
  }
  if(byGet) {
    options.qs = {query: query};
    request.get(options, afterRequest);
  } else {
    options.form = {query: query};
    request.post(options, afterRequest);
  }
};

function queryAll(endpoint, query, format, byGet, currentOffset, pageSize, callback) {
  let currentQuery = query;
  
  if(pageSize > 0) {
    currentQuery += ` LIMIT ${pageSize}`;
  }
  if(currentOffset > 0) {
    currentQuery += ` OFFSET ${currentOffset}`;
  }
  queryOnce(endpoint, currentQuery, format, byGet, (maxrows, error, response, body) => {
    if(error || response.statusCode != 200) {
      callback(error, response.statusCode, bodies);
    } else {
      bodies.push(body);
      if(maxrows) {
        maxrows = parseInt(maxrows);
        console.error(`Query next page (from ${currentOffset + maxrows})...`);
        queryAll(endpoint, query, format, byGet, currentOffset + maxrows, maxrows, callback);
      } else {
        callback(false, 200, bodies);
      }
    }
  });
};
