# SPANG

## SPARQL client

`spang2` is a commmand-line SPARQL client. It is now re-implemented in JavaScript, and comes with new features.

### Installation
```
$ cd spang2
$ npm install
$ npm link
```

### Usage
```
Usage: spang2 [options] <SPARQL_TEMPLATE>

Options:
  -e, --endpoint <ENDPOINT>    target SPARQL endpoint (URL or its predifined name in SPANG_DIR/etc/endpoints,~/.spang/endpoints)
  -r, --param <PARAMS>         parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")
  -f, --format <FORMAT>        tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html (default: "tsv")
  -a, --abbr                   abbreviate results using predefined prefixes
  -v, --vars                   variable names are included in output (in the case of tsv format)
  -S, --subject <SUBJECT>      shortcut to specify subject
  -P, --predicate <PREDICATE>  shortcut to specify predicate
  -O, --object <OBJECT>        shortcut to specify object
  -L, --limit <LIMIT>          LIMIT output (use alone or with -[SPOF])
  -F, --from <FROM>            shortcut to search FROM specific graph (use alone or with -[SPOLN])
  -N, --number                 shortcut to COUNT results (use alone or with -[SPO])
  -G, --graph                  shortcut to search for graph names (use alone or with -[SPO])
  -p, --prefix <PREFIX_FILES>  prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)
  -n, --ignore                 ignore user-specific file (~/.spang/prefix) for test purpose
  -m, --method <METHOD>        GET or POST (default: "GET")
  -q, --show_query             show query and quit
  --fmt                        format query
  -l, --list_nick_name         list up available nicknames of endpoints and quit
  -V, --version                output the version number
  -h, --help                   output usage information
```
### Test examples
```
$ ./node_modules/mocha/bin/mocha
```
Or, if you have globally installed mocha,

```
$ mocha
```

### Update spang_bundled.js
Update the `lib/spang_bundled.js` as follows after editing any other JS codes
```
$ ./node_modules/browserify/bin/cmd.js lib/spang_browser.js > lib/spang_bundled.js 
```

## SPARQL formatter

`spfmt` is a SPARQL formatter written in JavaScript.

It can be used in a web site or in the command line.

An example web site:<br>
https://hchiba1.github.io/spang/examples/

### Usage on a web site

* Download `spfmt_bundled.js` and use it in your HTML.

```
<script src="/js/spfmt_bundled.js"></script>
```

* Then you can use `spfmt.reformat`.
```javascript
spfmt.reformat("SELECT * WHERE {?s ?p ?o}");
/*
SELECT *
WHERE {
    ?s ?p ?o .
}
*/
```

* You can also call `spfmt_bundled.js` through the jsDelivr service.
```
    <textarea id="sparql-text" rows=5></textarea>
    <button id="reformat-button">Reformat</button>
    <textarea id="sparql-text-after" rows=5></textarea>
    
    <script src="https://cdn.jsdelivr.net/gh/hchiba1/spang@master/lib/spfmt_bundled.js"></script>  
    <script type="text/javascript">
     window.onload = () => {
         var textArea = 
             document.querySelector("#reformat-button").addEventListener('click', (event) => {
                 document.querySelector("#sparql-text-after").value =
                     spfmt.reformat(document.querySelector("#sparql-text").value);
             });
     };
    </script>
```
### Usage in command line

#### Requirements
- Node.js (>= 11.0.0)
- npm (>= 6.12.0)

#### Installation
```
$ npm install
$ npm link
```

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

#### Test examples
If you have globally installed mocha

```
$ mocha
```
Otherwise,
```
$ ./node_modules/mocha/bin/mocha
```

### Update spfmt_bundled.js
Update the `spfmt_bundled.js` as follows after editing any other JS codes
```
$ ./node_modules/browserify/bin/cmd.js lib/spfmt_browser.js > lib/spfmt_bundled.js 
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
