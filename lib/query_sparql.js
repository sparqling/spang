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

module.exports = (endpoint, proxy, query, format, byGet, callback) => {
  queryAll(endpoint, proxy, query, format, byGet, 0, 0, [], callback);
};

function queryOnce(endpoint, proxy, query, format, byGet, afterQueryOnce) {
  const accept = acceptHeaderMap[format];
  const options = {
    uri: proxy ? proxy : endpoint,
    followAllRedirects: true,
    headers: {
      'User-agent': `SPANG/${version}`,
      Accept: accept
    }
  };
  let requestParams = { query: query };
  if (proxy) {
    requestParams.endpoint = endpoint;
  }
  if (byGet) {
    options.method = 'GET';
    options.qs = requestParams;
  } else {
    options.method = 'POST';
    options.form = requestParams;
  }

  request(options, (error, response, body) => {
    let maxrows = null;
    if (response && response.headers) {
      maxrows = response.headers['x-sparql-maxrows'];
    }
    afterQueryOnce(maxrows, error, response, body);
  });
}

function queryAll(endpoint, proxy, query, format, byGet, currentOffset, pageSize, bodies, callback) {
  let currentQuery = query;
  if (pageSize > 0) {
    currentQuery += ` LIMIT ${pageSize}`;
  }
  if (currentOffset > 0) {
    currentQuery += ` OFFSET ${currentOffset}`;
  }
  queryOnce(endpoint, proxy, currentQuery, format, byGet, (maxrows, error, response, body) => {
    bodies.push(body);
    if (error || response.statusCode != 200) {
      callback(error, response && response.statusCode, bodies);
    } else {
      if (maxrows) {
        maxrows = parseInt(maxrows);
        console.error(`Querying with OFFSET ${currentOffset + maxrows} LIMIT ${maxrows}`);
        queryAll(endpoint, proxy, query, format, byGet, currentOffset + maxrows, maxrows, bodies, callback);
      } else {
        callback(false, 200, bodies);
      }
    }
  });
}
