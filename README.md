# SPARQL-related utilities

## Command-line utilities

### Client

[spang2](https://github.com/hchiba1/sparql-utils/tree/master/spang2)

SPANG is a commmand-line SPARQL client. It is now re-implemented in JavaScript, and comes with new features.

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
