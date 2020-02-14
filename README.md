# SPARQL-related utilities

## Command-line utilities

### Client

[spang2](https://github.com/hchiba1/sparql-utils/tree/master/spang2)

SPANG is a commmand-line SPARQL client. It is now re-implemented in JavaScript, and comes with new features.
```
$ cd spang2
$ npm install
$ npm link
```
```
Usage: spang2 [options] <SPARQL_TEMPLATE>

Options:
  -V, --version                output the version number
  -f, --format <FORMAT>        tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html (default: "tsv")
  -e, --endpoint <ENDPOINT>    target endpoint
  -S, --subject <SUBJECT>      shortcut to specify subject
  -P, --predicate <PREDICATE>  shortcut to specify predicate
  -O, --object <OBJECT>        shortcut to specify object
  -F, --from <FROM>            shortcut to search FROM specific graph (use alone or with -[SPOLN])
  -N, --number                 shortcut of COUNT query (use alone or with -[SPO])
  -G, --graph                  shortcut to search Graph names (use alone or with -[SPO])
  -q, --show_query             show query and quit
  -L, --limit <LIMIT>          LIMIT output (use alone or with -[SPOF])
  -l, --list_nick_name         list up available nicknames and quit
  --param <PARAMS>             parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")
  -h, --help                   output usage information
```

### Formatter

[spfmt](https://github.com/hchiba1/sparql-utils/tree/master/spfmt)

`spfmt` is a SPARQL formatter written in JavaScript.

## Specifications

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
