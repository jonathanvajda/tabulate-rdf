// __tests__/core.test.js

// Adjust this path if your core.js is in a different folder.
// For docs/app/core.js:
import {
  detectRdfFormatFromFilename,
  toPascalCase,
  pickBestLiteral,
  buildElementTableModel,
  filterAndSortRows,
  NS
} from '../docs/app/core.js';

import { Store, DataFactory } from 'n3';

const { namedNode, literal, quad } = DataFactory;

describe('detectRdfFormatFromFilename', () => {
  test('detects ttl as text/turtle', () => {
    expect(detectRdfFormatFromFilename('example.ttl')).toBe('text/turtle');
  });

  test('detects nt as application/n-triples', () => {
    expect(detectRdfFormatFromFilename('data.nt')).toBe('application/n-triples');
  });

  test('falls back to turtle for unknown extension', () => {
    expect(detectRdfFormatFromFilename('weird.ext')).toBe('text/turtle');
  });
});

describe('toPascalCase', () => {
  test('converts simple phrase', () => {
    expect(toPascalCase('example ontology name')).toBe('ExampleOntologyName');
  });

  test('handles punctuation and multiple separators', () => {
    expect(toPascalCase('example-ontology_name.foo')).toBe('ExampleOntologyNameFoo');
  });

  test('handles null gracefully', () => {
    expect(toPascalCase(null)).toBe('Ontology');
  });
});

describe('pickBestLiteral', () => {
  test('prefers english literal when available', () => {
    const enLit = literal('English', 'en');
    const frLit = literal('French', 'fr');
    const result = pickBestLiteral([frLit, enLit]);
    expect(result.value).toBe('English');
  });

  test('prefers no-lang literal if no english', () => {
    const plain = literal('Plain');
    const deLit = literal('Deutsch', 'de');
    const result = pickBestLiteral([deLit, plain]);
    expect(result.value).toBe('Plain');
  });

  test('returns first literal if only non-english, with language', () => {
    const fr = literal('Français', 'fr');
    const es = literal('Español', 'es');
    const result = pickBestLiteral([fr, es]);
    expect(result.value).toBe('Français');
  });
});

describe('buildElementTableModel (fixed columns)', () => {
  test('builds model with fixed headers and mapped data', () => {
    const store = new Store();

    const cls = namedNode('http://example.org/ClassA');
    const parentCls = namedNode('http://example.org/ParentClass');
    const curatedInOnt = namedNode('http://example.org/ExampleOntology');

    // rdf:type owl:Class (so it gets included as an element)
    store.addQuad(quad(cls, namedNode(NS.rdf + 'type'), namedNode(NS.owl + 'Class')));

    // label candidates: rdfs:label > dcterms:title > dc:title
    store.addQuad(quad(cls, namedNode(NS.rdfs + 'label'), literal('Class A Label', 'en')));
    store.addQuad(quad(cls, namedNode(NS.dcterms + 'title'), literal('Class A Title', 'en')));

    // definition candidates: skos:definition > obo:IAO_0000115 > cco:definition
    store.addQuad(quad(cls, namedNode(NS.skos + 'definition'), literal('A test definition', 'en')));

    // preferred label: skos:prefLabel > obo:IAO_0000111
    store.addQuad(quad(cls, namedNode(NS.skos + 'prefLabel'), literal('Preferred A', 'en')));

    // alternative labels: skos:altLabel, obo:IAO_0000118, cco:alternative_label
    store.addQuad(quad(cls, namedNode(NS.skos + 'altLabel'), literal('Alt 1', 'en')));
    store.addQuad(quad(cls, namedNode(NS.skos + 'altLabel'), literal('Alt 2', 'en')));

    // acronym: cco:acronym, obo:IAO_0000606, cco2:ont00001753
    store.addQuad(quad(cls, namedNode(NS.cco + 'acronym'), literal('CA')));

    // rdfs:subClassOf (non-blank)
    store.addQuad(quad(cls, namedNode(NS.rdfs + 'subClassOf'), parentCls));

    // definition source: use dcterms:bibliographicCitation so “definition source” column is present
    store.addQuad(
      quad(
        cls,
        namedNode(NS.dcterms + 'bibliographicCitation'),
        literal('Smith 2020', 'en')
      )
    );

    // is curated in: cco2:ont00001760 > rdfs:isDefinedBy
    store.addQuad(
      quad(
        cls,
        namedNode(NS.cco2 + 'ont00001760'),
        curatedInOnt
      )
    );

    const model = buildElementTableModel(store);

    // Check headers and keys are aligned and contain expected labels
    expect(model.headers[0]).toBe('iri');
    expect(model.keys[0]).toBe('iri');

    // Headers should contain at least these (columns with data)
    expect(model.headers).toContain('label');
    expect(model.headers).toContain('type');
    expect(model.headers).toContain('definition');
    expect(model.headers).toContain('preferred label');
    expect(model.headers).toContain('alternative label');
    expect(model.headers).toContain('acronym');
    expect(model.headers).toContain('rdfs:subClassOf');
    expect(model.headers).toContain('definition source');
    expect(model.headers).toContain('is curated in');

    // There should be exactly one row for ClassA
    expect(model.rows.length).toBe(1);
    const row = model.rows[0];

    // Basic fields
    expect(row.iri).toBe(cls.value);
    expect(row.label).toBe('Class A Label');
    expect(row.definition).toBe('A test definition');
    expect(row.preferredLabel).toBe('Preferred A');

    // type should contain owl:Class
    expect(row.type).toContain(NS.owl + 'Class');

    // multi-valued fields are joined with "; "
    expect(row.alternativeLabel).toContain('Alt 1');
    expect(row.alternativeLabel).toContain('Alt 2');
    expect(row.acronym).toBe('CA');
    expect(row.subClassOf).toContain(parentCls.value);
    expect(row.definitionSource).toContain('Smith 2020');
    expect(row.isCuratedIn).toBe(curatedInOnt.value);
  });
});

describe('filterAndSortRows', () => {
  test('filters and sorts based on keys', () => {
    const model = {
      headers: ['iri', 'label'],
      keys: ['iri', 'label'],
      rows: [
        { iri: 'http://example.org/a', label: 'Zebra' },
        { iri: 'http://example.org/b', label: 'Apple' },
        { iri: 'http://example.org/c', label: 'Banana' }
      ]
    };

    // Filter by substring "a" in label
    const filtered = filterAndSortRows(model, 'an', 1, 'asc');
    // Banana matches, Zebra doesn't, Apple doesn't
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('Banana');

    // No filter, sort by label ascending
    const sortedAsc = filterAndSortRows(model, '', 1, 'asc');
    expect(sortedAsc.map(r => r.label)).toEqual(['Apple', 'Banana', 'Zebra']);

    // Sort by label descending
    const sortedDesc = filterAndSortRows(model, '', 1, 'desc');
    expect(sortedDesc.map(r => r.label)).toEqual(['Zebra', 'Banana', 'Apple']);
  });
});
