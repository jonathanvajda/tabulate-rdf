// app/core.js
// Core ontology logic – ES modules, “mostly pure”, with logging & error handling.

/* eslint-disable no-console */

/**
 * Simple event logger for core functions.
 * @param {string} fnName
 * @param {string} message
 * @param {object} [data]
 */
export function logEvent(fnName, message, data) {
  console.info(`[${fnName}] ${message}`, data ?? '');
}

/**
 * Error logger for core functions.
 * @param {string} fnName
 * @param {Error} error
 * @param {object} [context]
 */
export function logError(fnName, error, context) {
  console.error(`[${fnName}] ERROR: ${error.message}`, { error, context });
}

/**
 * Guess RDF format from filename extension for N3 parser.
 * @param {string} filename
 * @returns {'text/turtle'|'application/n-triples'|'application/n-quads'|'application/trig'}
 */
export function detectRdfFormatFromFilename(filename) {
  const fnName = 'detectRdfFormatFromFilename';
  logEvent(fnName, 'start', { filename });

  try {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.ttl') || lower.endsWith('.n3')) {
      return 'text/turtle';
    }
    if (lower.endsWith('.nt')) {
      return 'application/n-triples';
    }
    if (lower.endsWith('.nq')) {
      return 'application/n-quads';
    }
    if (lower.endsWith('.trig')) {
      return 'application/trig';
    }
    // Fallback: Turtle
    return 'text/turtle';
  } catch (err) {
    logError(fnName, err, { filename });
    throw err;
  }
}

/**
 * Check if a term from N3 is a blank node.
 * @param {import('n3').Term} term
 * @returns {boolean}
 */
export function isBlankNode(term) {
  const fnName = 'isBlankNode';
  logEvent(fnName, 'start', { termType: term?.termType, value: term?.value });

  try {
    return !!term && term.termType === 'BlankNode';
  } catch (err) {
    logError(fnName, err, { term });
    throw err;
  }
}

/**
 * Parse RDF text into an N3 Store.
 * NOTE: In browser we get N3 from window.N3; in Jest we use node 'n3' dependency.
 * @param {string} text
 * @param {string} format
 * @returns {Promise<import('n3').Store>}
 */
export async function parseRdfTextToStore(text, format) {
  const fnName = 'parseRdfTextToStore';
  logEvent(fnName, 'start', { format });

  try {
    const N3lib = typeof window !== 'undefined' && window.N3
      ? window.N3
      : await import('n3'); // node / Jest

    const { Parser, Store } = N3lib;
    const parser = new Parser({ format });
    const store = new Store();

    const quads = parser.parse(text);
    store.addQuads(quads);

    logEvent(fnName, 'parsed', { quadCount: quads.length });
    return store;
  } catch (err) {
    logError(fnName, err, { format });
    throw err;
  }
}

// Namespace constants
export const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  obo: 'http://purl.obolibrary.org/obo/',
  cco: 'http://www.ontologyrepository.com/CommonCoreOntologies/',
  cco2: 'https://www.commoncoreontologies.org/'
};

export const COMMON_PREFIXES = {
  [NS.rdf]: 'rdf',
  [NS.rdfs]: 'rdfs',
  [NS.owl]: 'owl',
  [NS.dc]: 'dc',
  [NS.dcterms]: 'dcterms',
  [NS.skos]: 'skos'
};

/**
 * Pick the ontology subject (IRI) from a store.
 * Strategy: any subject with rdf:type owl:Ontology.
 * @param {import('n3').Store} store
 * @returns {string|null} ontologyIri
 */
export function getOntologySubjectIri(store) {
  const fnName = 'getOntologySubjectIri';
  logEvent(fnName, 'start');

  try {
    const all = store.getQuads(null, null, null, null);
    const candidate = all.find(q =>
      q.predicate.termType === 'NamedNode' &&
      q.predicate.value === NS.rdf + 'type' &&
      q.object.termType === 'NamedNode' &&
      q.object.value === NS.owl + 'Ontology'
    );

    if (!candidate) {
      logEvent(fnName, 'no ontology subject found');
      return null;
    }

    const iri = candidate.subject.value;
    logEvent(fnName, 'ontology subject found', { iri });
    return iri;
  } catch (err) {
    logError(fnName, err);
    throw err;
  }
}

/**
 * Pick best literal from a list of literals, preferring 'en' then no language, then others.
 * @param {import('n3').Literal[]} literals
 * @returns {import('n3').Literal|null}
 */
export function pickBestLiteral(literals) {
  const fnName = 'pickBestLiteral';
  logEvent(fnName, 'start', { count: literals?.length ?? 0 });

  try {
    if (!literals || literals.length === 0) return null;

    const withLang = literals.filter(l => l.language);
    const en = withLang.find(l => l.language.toLowerCase() === 'en');
    if (en) return en;

    const noLang = literals.find(l => !l.language);
    if (noLang) return noLang;

    return literals[0];
  } catch (err) {
    logError(fnName, err);
    throw err;
  }
}

/**
 * Get all quads whose subject matches the given IRI string.
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @returns {import('n3').Quad[]}
 */
export function getQuadsForSubject(store, subjectIri) {
  const fnName = 'getQuadsForSubject';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const all = store.getQuads(null, null, null, null);
    return all.filter(q =>
      q.subject.termType === 'NamedNode' &&
      q.subject.value === subjectIri
    );
  } catch (err) {
    logError(fnName, err, { subjectIri });
    throw err;
  }
}

/**
 * Helper: get single preferred literal value for subject & predicate.
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @param {string[]} predicateIris ordered by preference
 * @returns {string|null}
 */
export function getPreferredLiteralForPredicates(store, subjectIri, predicateIris) {
  const fnName = 'getPreferredLiteralForPredicates';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const subjectQuads = getQuadsForSubject(store, subjectIri);

    for (const p of predicateIris) {
      const literals = subjectQuads
        .filter(q =>
          q.predicate.termType === 'NamedNode' &&
          q.predicate.value === p &&
          q.object.termType === 'Literal'
        )
        .map(q => q.object);

      const best = pickBestLiteral(literals);
      if (best) return best.value;
    }

    return null;
  } catch (err) {
    logError(fnName, err, { subjectIri, predicateIris });
    throw err;
  }
}


/**
 * Helper: get preferred IRI/URI object for predicates (e.g. versionIRI, license).
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @param {string[]} predicateIris
 * @returns {string|null}
 */
export function getPreferredIriForPredicates(store, subjectIri, predicateIris) {
  const fnName = 'getPreferredIriForPredicates';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const subjectQuads = getQuadsForSubject(store, subjectIri);

    for (const p of predicateIris) {
      const iriObj = subjectQuads
        .filter(q =>
          q.predicate.termType === 'NamedNode' &&
          q.predicate.value === p &&
          q.object.termType === 'NamedNode'
        )
        .map(q => q.object)[0];

      if (iriObj) return iriObj.value;
    }

    return null;
  } catch (err) {
    logError(fnName, err, { subjectIri, predicateIris });
    throw err;
  }
}

/**
 * Get all literal values for any of the given predicates.
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @param {string[]} predicateIris
 * @returns {string[]}
 */
export function getLiteralArrayForPredicates(store, subjectIri, predicateIris) {
  const fnName = 'getLiteralArrayForPredicates';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const subjectQuads = getQuadsForSubject(store, subjectIri);
    const values = new Set();

    subjectQuads.forEach(q => {
      if (
        q.predicate.termType === 'NamedNode' &&
        predicateIris.includes(q.predicate.value) &&
        q.object.termType === 'Literal'
      ) {
        values.add(q.object.value);
      }
    });

    return Array.from(values);
  } catch (err) {
    logError(fnName, err, { subjectIri, predicateIris });
    throw err;
  }
}

/**
 * Get all IRI values (NamedNodes, non-blank) for any of the given predicates.
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @param {string[]} predicateIris
 * @returns {string[]}
 */
export function getIriArrayForPredicates(store, subjectIri, predicateIris) {
  const fnName = 'getIriArrayForPredicates';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const subjectQuads = getQuadsForSubject(store, subjectIri);
    const values = new Set();

    subjectQuads.forEach(q => {
      if (
        q.predicate.termType === 'NamedNode' &&
        predicateIris.includes(q.predicate.value) &&
        q.object.termType === 'NamedNode' &&
        !isBlankNode(q.object)
      ) {
        values.add(q.object.value);
      }
    });

    return Array.from(values);
  } catch (err) {
    logError(fnName, err, { subjectIri, predicateIris });
    throw err;
  }
}

/**
 * Get all values (literal or IRI) for any of the given predicates.
 * @param {import('n3').Store} store
 * @param {string} subjectIri
 * @param {string[]} predicateIris
 * @returns {string[]}
 */
export function getAnyArrayForPredicates(store, subjectIri, predicateIris) {
  const fnName = 'getAnyArrayForPredicates';
  logEvent(fnName, 'start', { subjectIri });

  try {
    const subjectQuads = getQuadsForSubject(store, subjectIri);
    const values = new Set();

    subjectQuads.forEach(q => {
      if (
        q.predicate.termType === 'NamedNode' &&
        predicateIris.includes(q.predicate.value)
      ) {
        if (q.object.termType === 'Literal' || q.object.termType === 'NamedNode') {
          values.add(q.object.value);
        }
      }
    });

    return Array.from(values);
  } catch (err) {
    logError(fnName, err, { subjectIri, predicateIris });
    throw err;
  }
}

/**
 * Extract ontology-level metadata according to your preference rules.
 * @param {import('n3').Store} store
 * @returns {{
 *   ontologyIri: string|null,
 *   ontologyName: string|null,
 *   versionIri: string|null,
 *   versionInfo: string|null,
 *   description: string|null,
 *   license: string|null,
 *   rightsHolder: string|null
 * }}
 */
export function extractOntologyMetadata(store) {
  const fnName = 'extractOntologyMetadata';
  logEvent(fnName, 'start');

  try {
    const ontologyIri = getOntologySubjectIri(store);
    if (!ontologyIri) {
      return {
        ontologyIri: null,
        ontologyName: null,
        versionIri: null,
        versionInfo: null,
        description: null,
        license: null,
        rightsHolder: null
      };
    }

    const S = ontologyIri;
    const meta = {
      ontologyIri: S,
      ontologyName: getPreferredLiteralForPredicates(store, S, [
        NS.rdfs + 'label',
        NS.dcterms + 'title',
        NS.dc + 'title'
      ]),
      versionIri: getPreferredIriForPredicates(store, S, [
        NS.owl + 'versionIRI',
        NS.dcterms + 'hasVersion'
      ]),
      versionInfo: getPreferredLiteralForPredicates(store, S, [
        NS.owl + 'versionInfo',
        NS.dcterms + 'hasVersion'
      ]),
      description: getPreferredLiteralForPredicates(store, S, [
        NS.skos + 'definition',
        NS.dcterms + 'description',
        NS.dc + 'description'
      ]),
      license: getPreferredIriForPredicates(store, S, [
        NS.dcterms + 'license',
        NS.dcterms + 'rights',
        NS.dc + 'rights',
        NS.dcterms + 'accessRights'
      ]),
      rightsHolder: getPreferredLiteralForPredicates(store, S, [
        NS.dcterms + 'rightsHolder'
      ])
    };

    logEvent(fnName, 'metadata extracted', meta);
    return meta;
  } catch (err) {
    logError(fnName, err);
    throw err;
  }
}

/**
 * Decide if a subject should be included as an "ontology element".
 * We include owl:Class, owl:NamedIndividual, owl:ObjectProperty, owl:DatatypeProperty, owl:AnnotationProperty.
 * Skip blank nodes.
 * @param {import('n3').Store} store
 * @param {import('n3').Term} subject
 * @returns {boolean}
 */
export function shouldIncludeElementSubject(store, subject) {
  const fnName = 'shouldIncludeElementSubject';
  logEvent(fnName, 'start', { subject: subject?.value });

  try {
    if (!subject || subject.termType !== 'NamedNode') return false;

    const interestingTypes = [
      NS.owl + 'Class',
      NS.owl + 'NamedIndividual',
      NS.owl + 'ObjectProperty',
      NS.owl + 'DatatypeProperty',
      NS.owl + 'AnnotationProperty'
    ];

    const quadsForSubject = store.getQuads(subject, null, null, null);

    const types = quadsForSubject
      .filter(q =>
        q.predicate.termType === 'NamedNode' &&
        q.predicate.value === NS.rdf + 'type' &&
        q.object.termType === 'NamedNode'
      )
      .map(q => q.object.value);

    const include = types.some(t => interestingTypes.includes(t));
    return include;
  } catch (err) {
    logError(fnName, err, { subject });
    throw err;
  }
}

/**
 * Shorten IRI to CURIE using COMMON_PREFIXES if possible.
 * @param {string} iri
 * @returns {string}
 */
export function iriToCurieIfCommon(iri) {
  const fnName = 'iriToCurieIfCommon';
  logEvent(fnName, 'start', { iri });

  try {
    for (const [ns, prefix] of Object.entries(COMMON_PREFIXES)) {
      if (iri.startsWith(ns)) {
        return `${prefix}:${iri.slice(ns.length)}`;
      }
    }
    return iri;
  } catch (err) {
    logError(fnName, err, { iri });
    throw err;
  }
}

/**
 * Convert a free-text name to PascalCase.
 * Used for generating CSV/print filenames.
 * @param {string|null} name
 * @returns {string}
 */
export function toPascalCase(name) {
  const fnName = 'toPascalCase';
  logEvent(fnName, 'start', { name });

  try {
    if (!name) return 'Ontology';
    const parts = String(name)
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/);

    if (parts.length === 0) return 'Ontology';
    return parts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  } catch (err) {
    logError(fnName, err, { name });
    throw err;
  }
}

/**
 * Build a fixed-column table model for ontology elements.
 *
 * Columns (headers / keys):
 *  - iri                / iri
 *  - label              / label
 *  - type               / type              (array of rdf:type IRIs, joined with "; ")
 *  - definition         / definition
 *  - preferred label    / preferredLabel
 *  - alternative label  / alternativeLabel  (array, joined)
 *  - acronym            / acronym           (array, joined)
 *  - rdfs:subClassOf    / subClassOf        (array, joined)
 *  - rdfs:subPropertyOf / subPropertyOf     (array, joined)
 *  - definition source  / definitionSource  (array, joined)
 *  - is curated in      / isCuratedIn
 *
 * Columns with no values across all rows are removed (except "iri").
 *
 * @param {import('n3').Store} store
 * @returns {{
 *   headers: string[],
 *   keys: string[],
 *   rows: Array<Record<string, string>>
 * }}
 */
export function buildElementTableModel(store) {
  const fnName = 'buildElementTableModel';
  logEvent(fnName, 'start');

  try {
    const allQuads = store.getQuads(null, null, null, null);

    // collect NamedNode subjects (non-blank)
    const subjectTermMap = new Map(); // IRI -> Term
    allQuads.forEach(q => {
      if (!isBlankNode(q.subject) && q.subject.termType === 'NamedNode') {
        subjectTermMap.set(q.subject.value, q.subject);
      }
    });

    // Filter to ontology elements
    const elementSubjects = Array.from(subjectTermMap.values())
      .filter(subj => shouldIncludeElementSubject(store, subj));

    const rows = [];

    for (const subj of elementSubjects) {
      const iri = subj.value;

      const label = getPreferredLiteralForPredicates(store, iri, [
        NS.rdfs + 'label',
        NS.dcterms + 'title',
        NS.dc + 'title'
      ]);

      const typeArr = getIriArrayForPredicates(store, iri, [
        NS.rdf + 'type'
      ]);

      const definition = getPreferredLiteralForPredicates(store, iri, [
        NS.skos + 'definition',
        NS.obo + 'IAO_0000115',
        NS.cco + 'definition'
      ]);

      const preferredLabel = getPreferredLiteralForPredicates(store, iri, [
        NS.skos + 'prefLabel',
        NS.obo + 'IAO_0000111'
      ]);

      const alternativeLabelArr = getLiteralArrayForPredicates(store, iri, [
        NS.skos + 'altLabel',
        NS.obo + 'IAO_0000118',
        NS.cco + 'alternative_label'
      ]);

      const acronymArr = getLiteralArrayForPredicates(store, iri, [
        NS.cco + 'acronym',
        NS.obo + 'IAO_0000606',
        NS.cco2 + 'ont00001753'
      ]);

      const subClassOfArr = getIriArrayForPredicates(store, iri, [
        NS.rdfs + 'subClassOf'
      ]);

      const subPropertyOfArr = getIriArrayForPredicates(store, iri, [
        NS.rdfs + 'subPropertyOf'
      ]);

      const definitionSourceArr = getAnyArrayForPredicates(store, iri, [
        NS.dcterms + 'bibliographicCitation',
        NS.obo + 'IAO_0000119',
        NS.cco2 + 'ont00001754',
        NS.cco + 'definition_source',
        NS.cco2 + 'ont00001745',
        NS.cco + 'doctrinal_source'
      ]);

      const isCuratedIn = getPreferredIriForPredicates(store, iri, [
        NS.cco2 + 'ont00001760',
        NS.rdfs + 'isDefinedBy'
      ]);

      const row = {
        iri,
        label: label || '',
        type: typeArr.join('; '),
        definition: definition || '',
        preferredLabel: preferredLabel || '',
        alternativeLabel: alternativeLabelArr.join('; '),
        acronym: acronymArr.join('; '),
        subClassOf: subClassOfArr.join('; '),
        subPropertyOf: subPropertyOfArr.join('; '),
        definitionSource: definitionSourceArr.join('; '),
        isCuratedIn: isCuratedIn || ''
      };

      rows.push(row);
    }

    // Fixed columns
    const allHeaders = [
      'iri',
      'label',
      'type',
      'definition',
      'preferred label',
      'alternative label',
      'acronym',
      'rdfs:subClassOf',
      'rdfs:subPropertyOf',
      'definition source',
      'is curated in'
    ];

    const allKeys = [
      'iri',
      'label',
      'type',
      'definition',
      'preferredLabel',
      'alternativeLabel',
      'acronym',
      'subClassOf',
      'subPropertyOf',
      'definitionSource',
      'isCuratedIn'
    ];

    // Remove columns that are completely empty across rows (except iri)
    const keepFlags = allKeys.map((key, idx) => {
      if (key === 'iri') return true;
      return rows.some(r => (r[key] ?? '').trim() !== '');
    });

    const headers = allHeaders.filter((_, i) => keepFlags[i]);
    const keys = allKeys.filter((_, i) => keepFlags[i]);

    logEvent(fnName, 'built', {
      rowCount: rows.length,
      columnCount: headers.length
    });

    // prune unused keys from rows
    const prunedRows = rows.map(r => {
      const obj = {};
      keys.forEach(k => {
        obj[k] = r[k] ?? '';
      });
      return obj;
    });

    return {
      headers,
      keys,
      rows: prunedRows
    };
  } catch (err) {
    logError(fnName, err);
    throw err;
  }
}

/**
 * Filter & sort rows for the fixed-column model.
 * @param {{
 *   headers: string[],
 *   keys: string[],
 *   rows: Array<Record<string, string>>
 * }} model
 * @param {string} query
 * @param {number|null} sortIndex
 * @param {'asc'|'desc'} sortDirection
 * @returns {Array<Record<string, string>>}
 */
export function filterAndSortRows(model, query, sortIndex, sortDirection = 'asc') {
  const fnName = 'filterAndSortRows';
  logEvent(fnName, 'start', { query, sortIndex, sortDirection });

  try {
    const q = (query || '').toLowerCase();

    let filtered = model.rows;
    if (q) {
      filtered = filtered.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(q))
      );
    }

    if (sortIndex == null || sortIndex < 0 || sortIndex >= model.headers.length) {
      return filtered;
    }

    const key = model.keys[sortIndex];
    if (!key) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      const va = String(a[key] ?? '');
      const vb = String(b[key] ?? '');
      const cmp = va.localeCompare(vb);
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return sorted;
  } catch (err) {
    logError(fnName, err, { query, sortIndex, sortDirection });
    throw err;
  }
}