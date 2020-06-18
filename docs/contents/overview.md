# Overview

An increasing number of biological databases have been made available
in the form of Resource Description Framework (RDF) and accessible
through SPARQL endpoints, forming together a worldwide platform of
biological data integration across the web. However, writing SPARQL
codes for querying the databases often becomes a burden for
biologists; thus, an easy-to-use querying interface is necessary.

Here, we developed a command-line SPARQL client, SPANG. SPANG can
dynamically generate typical SPARQL queries depending on command-line
options and arguments. SPANG supports interprocess communication to
pass the variable bindings between queries, enabling execution of
combination of queries and integration of data across the multiple
SPARQL endpoints. SPANG can also search local RDF files besides remote
data stores. These features provide the users an easy ways to
integrate distributed data described in RDF, thus enhances the
integrative analysis of biological data on the Semantic Web platform.

