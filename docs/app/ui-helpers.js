// app/ui-helpers.js
import { filterAndSortRows, toPascalCase } from './core.js';

export function showLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.remove('ontoview-loading-hidden');
}

export function hideLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.add('ontoview-loading-hidden');
}

export function toggleTheme() {
  const body = document.body;
  if (!body.classList.contains('ontoview-theme-dark')) {
    body.classList.add('ontoview-theme-dark');
    body.classList.remove('ontoview-theme-light');
  } else {
    body.classList.add('ontoview-theme-light');
    body.classList.remove('ontoview-theme-dark');
  }
}

export function renderFileList(fileInfos) {
  const ul = document.getElementById('ontologyFileList');
  if (!ul) return;
  ul.innerHTML = '';

  fileInfos.forEach(info => {
    const li = document.createElement('li');
    li.className = 'ontoview-filelist-item';
    li.textContent = `${info.displayName} (${info.quadCount} triples)`;
    ul.appendChild(li);
  });
}

export function createLinkIfUri(value) {
  try {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
      return `<a href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>`;
    }
    return value;
  } catch {
    return value;
  }
}

export function renderOntologyCard(container, metadata) {
  const card = document.createElement('article');
  card.className = 'ontoview-card';

  const title = document.createElement('h3');
  title.className = 'ontoview-card-title';
  title.textContent = metadata.ontologyName || metadata.ontologyIri || 'Unnamed Ontology';
  card.appendChild(title);

  const table = document.createElement('table');
  table.className = 'ontoview-card-table';

  const fields = [
    ['Ontology Name', metadata.ontologyName],
    ['Ontology IRI', createLinkIfUri(metadata.ontologyIri)],
    ['Version IRI', createLinkIfUri(metadata.versionIri)],
    ['Version Info', metadata.versionInfo],
    ['Description', metadata.description],
    ['License', createLinkIfUri(metadata.license)],
    ['Copyright', metadata.rightsHolder]
  ];

  fields.forEach(([label, value]) => {
    if (!value) return;
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.className = 'ontoview-card-table-cell-key';
    tdKey.textContent = `${label}:`;

    const tdVal = document.createElement('td');
    tdVal.className = 'ontoview-card-table-cell-value';
    tdVal.innerHTML = String(value);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    table.appendChild(tr);
  });

  card.appendChild(table);
  container.appendChild(card);
}

export function renderOntologyTable(container, ontologyMeta, tableModel) {
  const wrapper = document.createElement('section');
  wrapper.className = 'ontoview-table-wrapper';

  const headerRow = document.createElement('div');
  headerRow.className = 'ontoview-table-header-row';

  const title = document.createElement('h3');
  title.className = 'ontoview-table-title';
  title.textContent = (ontologyMeta.ontologyName || ontologyMeta.ontologyIri || 'Ontology Elements');
  headerRow.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'ontoview-table-actions';

  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.placeholder = 'Filter...';
  filterInput.className = 'ontoview-table-filter-input';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'ontoview-button';
  exportBtn.textContent = 'Export CSV';

  const printBtn = document.createElement('button');
  printBtn.className = 'ontoview-button';
  printBtn.textContent = 'Print';

  actions.appendChild(filterInput);
  actions.appendChild(exportBtn);
  actions.appendChild(printBtn);
  headerRow.appendChild(actions);

  wrapper.appendChild(headerRow);

  const table = document.createElement('table');
  table.className = 'ontoview-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  tableModel.headers.forEach((h, idx) => {
    const th = document.createElement('th');
    th.className = 'ontoview-table-header-cell ontoview-table-header-cell-sortable';
    th.textContent = h;
    th.dataset.sortIndex = String(idx);
    th.dataset.colKey = tableModel.keys[idx];   // NEW
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  wrapper.appendChild(table);
  container.appendChild(wrapper);

  // state
  let sortIndex = 0;
  let sortDirection = 'asc';
  let currentQuery = '';

  function rerenderBody() {
    const rows = filterAndSortRows(tableModel, currentQuery, sortIndex, sortDirection);
    tbody.innerHTML = '';
    rows.forEach(rowModel => {
      const tr = document.createElement('tr');
      tableModel.headers.forEach((h, i) => {
        const td = document.createElement('td');
        td.className = 'ontoview-table-data-cell';

        const key = tableModel.keys[i];
        td.dataset.colKey = key;                    // NEW

        const value = key ? rowModel[key] : '';
        td.textContent = value || '';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  rerenderBody();

  // events
  thead.addEventListener('click', ev => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const idx = target.dataset.sortIndex;
    if (idx == null) return;

    const i = Number(idx);
    if (i === sortIndex) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortIndex = i;
      sortDirection = 'asc';
    }
    rerenderBody();
  });

  filterInput.addEventListener('input', ev => {
    currentQuery = ev.target.value;
    rerenderBody();
  });

  exportBtn.addEventListener('click', () => {
    const rows = filterAndSortRows(tableModel, currentQuery, sortIndex, sortDirection);
    const csv = tableModelToCsv(tableModel, rows);
    const baseName = toPascalCase(ontologyMeta.ontologyName || ontologyMeta.ontologyIri);
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const filename = `${baseName}_${timestamp}.csv`;
    downloadCsv(filename, csv);
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });
}

export function tableModelToCsv(model, rows) {
  const headerRow = model.headers.join(',');
  const lines = [headerRow];

  rows.forEach(row => {
    const values = model.keys.map(key => {
      const v = key ? (row[key] ?? '') : '';
      const escaped = String(v).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
