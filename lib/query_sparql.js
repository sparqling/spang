request = require('request')
const version = require("../package.json").version;

module.exports = (endpoint, query, format="json", byGet, callback) => {
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
  const accept = acceptHeaderMap[format];
  var options = {
    uri: endpoint, 
    form: {query: query},
    qs: {query: query},
    followAllRedirects: true,
    headers:{ 
      "User-agent": `SPANG/${version}`, 
      "Accept": accept
    }
  };
  if(byGet) {
    request.get(options, callback);
  } else {
    request.post(options, callback);
  }
};
