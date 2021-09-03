const request = require('request');
const version = require('../package.json').version;
const acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  "tsv"      : "application/sparql-results+json", // receive as json and format to tsv afterward
  "text"     : "text/tab-separated-values",
  "csv"      : "text/csv",
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

module.exports = (endpoint, query, format, byGet, callback) => {
  queryAll(endpoint, query, format, byGet, 0, 0, [], callback);
};

function queryOnce(endpoint, query, format, byGet, afterQueryOnce) {
  const accept = acceptHeaderMap[format];
  const options = {
    uri: endpoint,
    followAllRedirects: true,
    headers: {
      'User-agent': `SPANG/${version}`,
      Accept: accept
    }
  };
  if (byGet) {
    options.method = 'GET';
    options.qs = { query: query };
  } else {
    options.method = 'POST';
    options.form = { query: query };
  }

  request(options, (error, response, body) => {
    let maxrows = null;
    if (response && response.headers) {
      maxrows = response.headers['x-sparql-maxrows'];
    }
    afterQueryOnce(maxrows, error, response, body);
  });
}

function queryAll(endpoint, query, format, byGet, currentOffset, pageSize, bodies, callback) {
  let currentQuery = query;
  if (pageSize > 0) {
    currentQuery += ` LIMIT ${pageSize}`;
  }
  if (currentOffset > 0) {
    currentQuery += ` OFFSET ${currentOffset}`;
  }
  queryOnce(endpoint, currentQuery, format, byGet, (maxrows, error, response, body) => {
    bodies.push(body);
    if (error || response.statusCode != 200) {
      callback(error, response && response.statusCode, bodies);
    } else {
      if (maxrows) {
        maxrows = parseInt(maxrows);
        console.error(`Querying for the next page (OFFSET ${currentOffset + maxrows} LIMIT ${maxrows})...`);
        queryAll(endpoint, query, format, byGet, currentOffset + maxrows, maxrows, bodies, callback);
      } else {
        callback(false, 200, bodies);
      }
    }
  });
}
