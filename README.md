# SPANG

## SPARQL client

`spang2` is a commmand-line SPARQL client. It is now re-implemented in JavaScript, and comes with new features.

### Installation
```
$ git clone git@github.com/hchiba1/spang.git
$ cd spang
$ npm install
$ npm link
```

### Test examples
```
$ npm test
```

### Update spang.js
Update the `js/spang.js` as follows after editing any other JS codes
```
$ npm run browserify
```

## SPARQL formatter

`spfmt` is a SPARQL formatter written in JavaScript.

It can be used in a web site or in the command line.

An example web site:<br>
https://spang.dbcls.jp/example.html

### Usage on a web site

* Download `spfmt.js` and use it in your HTML.

```
<script src="/js/spfmt.js"></script>
```

* Then you can use `spfmt`.
```javascript
spfmt("SELECT * WHERE {?s ?p ?o}");
/*
SELECT *
WHERE {
  ?s ?p ?o .
}
*/
```

* You can also call `spfmt.js` through the jsDelivr service.
```
    <textarea id="sparql-text" rows=5></textarea>
    <button id="reformat-button">Reformat</button>
    <textarea id="sparql-text-after" rows=5></textarea>
    
    <script src="https://cdn.jsdelivr.net/gh/sparqling/spang@master/js/spfmt.js"></script>
    <script type="text/javascript">
     window.onload = () => {
         var textArea = 
             document.querySelector("#reformat-button").addEventListener('click', (event) => {
                 document.querySelector("#sparql-text-after").value =
                     spfmt(document.querySelector("#sparql-text").value);
             });
     };
    </script>
```
### Usage in command line

#### Requirements
- Node.js (>= 11.0.0)
- npm (>= 6.12.0)

#### Usage
```
$ cat messy.rq 
SELECT * WHERE         {         ?s ?p ?o }

$ spfmt messy.rq 
SELECT *
WHERE {
    ?s ?p ?o .
}
```

### Update spfmt.js
`js/spfmt.js` should be updated as follows after after modifying parser or formatter codes.
```
$ npm run browserify
```

## SPARQL specifications

### Syntax
The EBNF notation of SPARQL is extracted from:<br>
https://www.w3.org/TR/sparql11-query/#sparqlGrammar

The PEG expression of SPARQL grammer was originally provided by:<br>
https://github.com/antoniogarrote/rdfstore-js/

PEG can be tested at:<br>
https://pegjs.org/online

### Medadata
[sparql-doc](https://github.com/ldodds/sparql-doc)
```
# @title Get orthololog from MBGD
# @author Hirokazu Chiba
# @tag ortholog
# @endpoint http://sparql.nibb.ac.jp/sparql
```
extension
```
# @prefixes https://
# @input_class id:Taxon
# @output_class up:Protein
# @param gene=
```
