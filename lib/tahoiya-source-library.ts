import { redisCommand } from "@/lib/redis-store";

export type TahoiyaSourceEntry = {
  id: string;
  sourceRegistryId: string;
  word: string;
  reading?: string;
  hint: string;
  genre: string;
  sourceLibrary: string;
  sourceUrl: string;
};

type SourceStrategy =
  | "mesh-lookup" | "getty-sparql" | "loc-suggest" | "openalex-topics"
  | "gbif-species" | "worms-taxa" | "lobid-gnd" | "wikidata-sparql"
  | "agrovoc-sparql" | "dbpedia-sparql" | "inaturalist-taxa";

export type TahoiyaSourceRegistryRecord = {
  id: string;
  name: string;
  genre: string;
  endpoint: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  strategy: SourceStrategy;
  enabled: boolean;
  vocabulary?: "aat" | "tgn" | "ulan";
  seedQueries?: string[];
};

const registryKey = "tahoiya:source:registry:v1";
const stagingKey = "tahoiya:source:staging:v1";
const cursorKey = "tahoiya:source:cursor:v1";

const defaultSourceRegistry: TahoiyaSourceRegistryRecord[] = [
  {
    id: "nlm-mesh",
    name: "NLM Medical Subject Headings (MeSH)",
    genre: "医学・生命科学",
    endpoint: "https://id.nlm.nih.gov/mesh/lookup/descriptor",
    sourceUrl: "https://www.nlm.nih.gov/mesh/meshhome.html",
    license: "NLM data terms",
    attribution: "Courtesy of the U.S. National Library of Medicine",
    strategy: "mesh-lookup",
    enabled: true,
    seedQueries: [
      "syndrome", "anatomy", "pathology", "neurology", "hematology", "immunology",
      "metabolism", "microbiology", "toxicology", "histology", "embryology", "cardiology",
    ],
  },
  {
    id: "getty-aat",
    name: "Getty Art & Architecture Thesaurus (AAT)",
    genre: "美術・建築・考古・文化史",
    endpoint: "https://vocab.getty.edu/sparql.json",
    sourceUrl: "https://www.getty.edu/research/tools/vocabularies/aat/",
    license: "ODC-By 1.0",
    attribution: "The Art & Architecture Thesaurus® (AAT), J. Paul Getty Trust",
    strategy: "getty-sparql",
    vocabulary: "aat",
    enabled: true,
  },
  {
    id: "getty-tgn",
    name: "Getty Thesaurus of Geographic Names (TGN)",
    genre: "歴史地理・遺跡・地形",
    endpoint: "https://vocab.getty.edu/sparql.json",
    sourceUrl: "https://www.getty.edu/research/tools/vocabularies/tgn/",
    license: "ODC-By 1.0",
    attribution: "The Getty Thesaurus of Geographic Names® (TGN), J. Paul Getty Trust",
    strategy: "getty-sparql",
    vocabulary: "tgn",
    enabled: true,
  },
  { id: "getty-ulan", name: "Getty Union List of Artist Names (ULAN)", genre: "美術史・歴史人物", endpoint: "https://vocab.getty.edu/sparql.json", sourceUrl: "https://www.getty.edu/research/tools/vocabularies/ulan/", license: "ODC-By 1.0", attribution: "ULAN, J. Paul Getty Trust", strategy: "getty-sparql", vocabulary: "ulan", enabled: true },
  { id: "loc-lcsh", name: "Library of Congress Subject Headings", genre: "歴史・文化・学術一般", endpoint: "https://id.loc.gov/authorities/subjects/suggest/", sourceUrl: "https://id.loc.gov/authorities/subjects.html", license: "Library of Congress linked-data terms", attribution: "Library of Congress", strategy: "loc-suggest", enabled: true, seedQueries: ["archaeology", "ritual", "medieval", "folklore", "geology", "linguistics", "navigation", "manuscripts"] },
  { id: "openalex-topics", name: "OpenAlex Topics", genre: "科学・人文社会学", endpoint: "https://api.openalex.org/topics", sourceUrl: "https://docs.openalex.org/", license: "CC0", attribution: "OpenAlex", strategy: "openalex-topics", enabled: true },
  { id: "gbif-species", name: "GBIF Species Backbone", genre: "動物学・植物学・菌類学", endpoint: "https://api.gbif.org/v1/species/search", sourceUrl: "https://techdocs.gbif.org/en/openapi/", license: "GBIF data terms", attribution: "GBIF", strategy: "gbif-species", enabled: true },
  { id: "worms-taxa", name: "World Register of Marine Species", genre: "海洋生物学", endpoint: "https://www.marinespecies.org/rest/AphiaRecordsByVernacular", sourceUrl: "https://www.marinespecies.org/rest/", license: "WoRMS data terms", attribution: "WoRMS", strategy: "worms-taxa", enabled: true, seedQueries: ["sponge", "worm", "crab", "coral", "mollusc", "shrimp", "jellyfish", "starfish"] },
  { id: "lobid-gnd", name: "Integrated Authority File via lobid-gnd", genre: "歴史・文化・地名・専門概念", endpoint: "https://lobid.org/gnd/search", sourceUrl: "https://lobid.org/gnd", license: "CC0", attribution: "lobid-gnd / GND", strategy: "lobid-gnd", enabled: true, seedQueries: ["archaeology", "medicine", "architecture", "musicology", "botany", "geology", "ritual", "medieval"] },
  { id: "wikidata-specialized", name: "Wikidata Specialized Concepts", genre: "歴史・科学・文化一般", endpoint: "https://query.wikidata.org/sparql", sourceUrl: "https://www.wikidata.org/", license: "CC0", attribution: "Wikidata contributors", strategy: "wikidata-sparql", enabled: true },
  { id: "fao-agrovoc", name: "FAO AGROVOC", genre: "農学・食品・環境・生物", endpoint: "https://agrovoc.fao.org/sparql", sourceUrl: "https://www.fao.org/agrovoc/", license: "CC BY 4.0", attribution: "FAO AGROVOC", strategy: "agrovoc-sparql", enabled: true },
  { id: "dbpedia", name: "DBpedia Ontology Concepts", genre: "歴史・地理・科学・文化一般", endpoint: "https://dbpedia.org/sparql", sourceUrl: "https://www.dbpedia.org/", license: "CC BY-SA / GFDL", attribution: "DBpedia", strategy: "dbpedia-sparql", enabled: true },
  { id: "inaturalist", name: "iNaturalist Taxonomy", genre: "動物学・植物学・菌類学", endpoint: "https://api.inaturalist.org/v1/taxa", sourceUrl: "https://www.inaturalist.org/pages/api+reference", license: "iNaturalist API terms", attribution: "iNaturalist", strategy: "inaturalist-taxa", enabled: true },
];

const commonSpokenWords = new Set([
  "あめ", "いし", "かき", "かめ", "かみ", "かわ", "かえる", "きく", "くも", "さけ",
  "しろ", "つる", "はし", "はな", "ふく", "まつ", "みみ", "もち", "もも", "ゆき",
]);

export function hasVeryCommonSpokenHomophone(reading?: string) {
  if (!reading) return false;
  const normalized = reading.normalize("NFKC").trim().toLocaleLowerCase("ja");
  return commonSpokenWords.has(normalized);
}

function parseRegistryRecord(raw: string): TahoiyaSourceRegistryRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TahoiyaSourceRegistryRecord>;
    if (!parsed.id || !parsed.name || !parsed.endpoint || !parsed.strategy) return null;
    return parsed as TahoiyaSourceRegistryRecord;
  } catch {
    return null;
  }
}

function parseSourceEntry(raw: string): TahoiyaSourceEntry | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TahoiyaSourceEntry>;
    if (!parsed.id || !parsed.word || !parsed.sourceLibrary || !parsed.sourceUrl) return null;
    return {
      id: parsed.id,
      sourceRegistryId: parsed.sourceRegistryId || parsed.id.split(":")[0],
      word: parsed.word,
      reading: parsed.reading,
      hint: (parsed.hint || "専門語彙ライブラリの見出し語。").slice(0, 240),
      genre: parsed.genre || "専門用語",
      sourceLibrary: parsed.sourceLibrary,
      sourceUrl: parsed.sourceUrl,
    };
  } catch {
    return null;
  }
}

export async function ensureTahoiyaSourceRegistry() {
  await Promise.all(defaultSourceRegistry.map((source) => redisCommand<number>([
    "HSETNX", registryKey, source.id, JSON.stringify(source),
  ])));
}

export async function loadTahoiyaSourceRegistry() {
  await ensureTahoiyaSourceRegistry();
  const values = await redisCommand<string[]>(["HVALS", registryKey]);
  return (Array.isArray(values) ? values : [])
    .map(parseRegistryRecord)
    .filter((source): source is TahoiyaSourceRegistryRecord => Boolean(source?.enabled));
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GameFields/1.0 (vocabulary curation)" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`VOCABULARY_FETCH_FAILED_${response.status}`);
  return response.json() as Promise<unknown>;
}

async function collectMeshTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const queries = source.seedQueries?.length ? source.seedQueries : ["medicine"];
  const query = queries[cursor % queries.length];
  const url = new URL(source.endpoint);
  url.searchParams.set("label", query);
  url.searchParams.set("match", "contains");
  url.searchParams.set("limit", "30");
  const data = await fetchJson(url.toString());
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { resource?: unknown; label?: unknown };
    const resource = typeof item.resource === "string" ? item.resource : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!resource || !label) return [];
    return [{
      id: `${source.id}:${resource}`,
      sourceRegistryId: source.id,
      word: label,
      hint: `MeSH descriptor matched by ${query}. Translate only when an established Japanese medical term exists.`,
      genre: source.genre,
      sourceLibrary: source.name,
      sourceUrl: resource,
    } satisfies TahoiyaSourceEntry];
  });
}

async function collectGettyTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const vocabulary = source.vocabulary === "tgn" || source.vocabulary === "ulan" ? source.vocabulary : "aat";
  const offsetBase = vocabulary === "tgn" ? 50_000 : 20_000;
  const offset = offsetBase + (cursor * 37) % 200_000;
  const query = [
    "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>",
    "SELECT ?subject ?label ?note WHERE {",
    `  ?subject skos:inScheme <http://vocab.getty.edu/${vocabulary}/> ; skos:prefLabel ?label .`,
    "  FILTER(lang(?label) = 'en')",
    "  OPTIONAL { ?subject skos:scopeNote ?note . FILTER(lang(?note) = 'en') }",
    `} LIMIT 30 OFFSET ${offset}`,
  ].join("\n");
  const url = new URL(source.endpoint);
  url.searchParams.set("query", query);
  const data = await fetchJson(url.toString()) as {
    results?: { bindings?: Array<Record<string, { value?: string }>> };
  };
  return (data.results?.bindings ?? []).flatMap((binding) => {
    const resource = binding.subject?.value || "";
    const label = binding.label?.value?.trim() || "";
    if (!resource || !label) return [];
    return [{
      id: `${source.id}:${resource}`,
      sourceRegistryId: source.id,
      word: label,
      hint: binding.note?.value?.trim() || `${source.name}の統制語彙。日本語で定着した名称がある場合だけ採用する。`,
      genre: source.genre,
      sourceLibrary: source.name,
      sourceUrl: resource,
    } satisfies TahoiyaSourceEntry];
  });
}

function sourceEntry(source: TahoiyaSourceRegistryRecord, resource: string, word: string, hint: string): TahoiyaSourceEntry {
  return {
    id: `${source.id}:${resource}`,
    sourceRegistryId: source.id,
    word: word.slice(0, 120),
    hint: hint.replace(/\s+/g, " ").trim().slice(0, 240),
    genre: source.genre,
    sourceLibrary: source.name,
    sourceUrl: resource,
  };
}

async function collectLocTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const query = source.seedQueries?.[cursor % (source.seedQueries?.length || 1)] || "history";
  const url = new URL(source.endpoint);
  url.searchParams.set("q", query);
  const data = await fetchJson(url.toString());
  if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[3])) return [];
  return (data[1] as unknown[]).flatMap((label, index) => {
    const resource = String((data[3] as unknown[])[index] || "");
    const word = typeof label === "string" ? label.trim() : "";
    return resource && word ? [sourceEntry(source, resource, word, `LCSH search: ${query}`)] : [];
  });
}

async function collectOpenAlexTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const url = new URL(source.endpoint);
  url.searchParams.set("per-page", "30");
  url.searchParams.set("page", String((cursor % 200) + 1));
  const data = await fetchJson(url.toString()) as { results?: Array<{ id?: string; display_name?: string; description?: string }> };
  return (data.results || []).flatMap((item) => item.id && item.display_name
    ? [sourceEntry(source, item.id, item.display_name, item.description || "OpenAlex research topic")]
    : []);
}

async function collectGbifTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const url = new URL(source.endpoint);
  url.searchParams.set("rank", "GENUS");
  url.searchParams.set("status", "ACCEPTED");
  url.searchParams.set("limit", "30");
  url.searchParams.set("offset", String((cursor * 97) % 99_000));
  const data = await fetchJson(url.toString()) as { results?: Array<{ key?: number; canonicalName?: string; kingdom?: string }> };
  return (data.results || []).flatMap((item) => item.key && item.canonicalName
    ? [sourceEntry(source, `https://www.gbif.org/species/${item.key}`, item.canonicalName, `${item.kingdom || "生物"}の属名。日本語の定着名がある場合だけ採用する。`)]
    : []);
}

async function collectWormsTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const query = source.seedQueries?.[cursor % (source.seedQueries?.length || 1)] || "coral";
  const url = `${source.endpoint}/${encodeURIComponent(query)}?like=true&marine_only=true&offset=1`;
  const data = await fetchJson(url) as Array<{ AphiaID?: number; scientificname?: string; valid_name?: string }>;
  return (Array.isArray(data) ? data : []).flatMap((item) => item.AphiaID && (item.valid_name || item.scientificname)
    ? [sourceEntry(source, `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${item.AphiaID}`, item.valid_name || item.scientificname || "", `Marine taxon matched by ${query}. 日本語の定着名がある場合だけ採用する。`)]
    : []);
}

async function collectLobidTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const query = source.seedQueries?.[cursor % (source.seedQueries?.length || 1)] || "history";
  const url = new URL(source.endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("size", "30");
  const data = await fetchJson(url.toString()) as { member?: Array<{ id?: string; preferredName?: string; label?: string }> };
  return (data.member || []).flatMap((item) => {
    const word = item.preferredName || item.label || "";
    return item.id && word ? [sourceEntry(source, item.id, word, `GND authority matched by ${query}`)] : [];
  });
}

async function collectSparqlTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const offset = 5_000 + (cursor * 53) % 100_000;
  const query = source.strategy === "agrovoc-sparql"
    ? `PREFIX skos:<http://www.w3.org/2004/02/skos/core#> SELECT ?subject ?label ?note WHERE { ?subject skos:prefLabel ?label . FILTER(lang(?label)='en') OPTIONAL {?subject skos:scopeNote ?note . FILTER(lang(?note)='en')} } LIMIT 30 OFFSET ${offset}`
    : source.strategy === "dbpedia-sparql"
      ? `PREFIX rdfs:<http://www.w3.org/2000/01/rdf-schema#> PREFIX dbo:<http://dbpedia.org/ontology/> SELECT ?subject ?label ?note WHERE { ?subject a ?type; rdfs:label ?label . ?type rdfs:subClassOf* dbo:TopicalConcept . FILTER(lang(?label)='en') OPTIONAL {?subject dbo:abstract ?note . FILTER(lang(?note)='en')} } LIMIT 30 OFFSET ${offset}`
      : `SELECT ?subject ?label ?note WHERE { ?subject <http://www.w3.org/2000/01/rdf-schema#label> ?label . FILTER(lang(?label)='ja') OPTIONAL {?subject <http://schema.org/description> ?note . FILTER(lang(?note)='ja')} FILTER(STRSTARTS(STR(?subject),'http://www.wikidata.org/entity/Q')) } LIMIT 30 OFFSET ${offset}`;
  const url = new URL(source.endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  const data = await fetchJson(url.toString()) as { results?: { bindings?: Array<Record<string, { value?: string }>> } };
  return (data.results?.bindings || []).flatMap((binding) => {
    const resource = binding.subject?.value || "";
    const word = binding.label?.value?.trim() || "";
    return resource && word ? [sourceEntry(source, resource, word, binding.note?.value?.trim() || `${source.name}の統制語彙`)] : [];
  });
}

async function collectInaturalistTerms(source: TahoiyaSourceRegistryRecord, cursor: number) {
  const url = new URL(source.endpoint);
  url.searchParams.set("rank", "genus");
  url.searchParams.set("per_page", "30");
  url.searchParams.set("page", String((cursor % 300) + 20));
  url.searchParams.set("order_by", "observations_count");
  const data = await fetchJson(url.toString()) as { results?: Array<{ id?: number; name?: string; preferred_common_name?: string }> };
  return (data.results || []).flatMap((item) => item.id && item.name
    ? [sourceEntry(source, `https://www.inaturalist.org/taxa/${item.id}`, item.preferred_common_name || item.name, `Taxon ${item.name}. 日本語の定着名がある場合だけ採用する。`)]
    : []);
}

async function collectFromSource(source: TahoiyaSourceRegistryRecord) {
  const rawCursor = await redisCommand<string | null>(["HGET", cursorKey, source.id]);
  const cursor = Number.parseInt(rawCursor || "0", 10) || 0;
  const collectors: Record<SourceStrategy, () => Promise<TahoiyaSourceEntry[]>> = {
    "mesh-lookup": () => collectMeshTerms(source, cursor),
    "getty-sparql": () => collectGettyTerms(source, cursor),
    "loc-suggest": () => collectLocTerms(source, cursor),
    "openalex-topics": () => collectOpenAlexTerms(source, cursor),
    "gbif-species": () => collectGbifTerms(source, cursor),
    "worms-taxa": () => collectWormsTerms(source, cursor),
    "lobid-gnd": () => collectLobidTerms(source, cursor),
    "wikidata-sparql": () => collectSparqlTerms(source, cursor),
    "agrovoc-sparql": () => collectSparqlTerms(source, cursor),
    "dbpedia-sparql": () => collectSparqlTerms(source, cursor),
    "inaturalist-taxa": () => collectInaturalistTerms(source, cursor),
  };
  const entries = await collectors[source.strategy]();
  await redisCommand<number>(["HSET", cursorKey, source.id, String(cursor + 1)]);
  return entries;
}

async function storeStagedEntries(entries: TahoiyaSourceEntry[]) {
  if (entries.length === 0) return;
  const args = entries.flatMap((entry) => [entry.id, JSON.stringify(entry)]);
  await redisCommand<number>([
    "EVAL",
    "local n=0; for i=1,#ARGV,2 do if redis.call('HSETNX',KEYS[1],ARGV[i],ARGV[i+1])==1 then n=n+1 end end; return n",
    "1", stagingKey, ...args,
  ]);
}

export async function refreshTahoiyaSourceShelf(sourceIds?: string[]) {
  const sources = await loadTahoiyaSourceRegistry();
  const selected = sourceIds?.length ? sources.filter((source) => sourceIds.includes(source.id)) : sources;
  const settled = await Promise.allSettled(selected.map(collectFromSource));
  const entries = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  await storeStagedEntries(entries);
  return entries;
}

export async function loadTahoiyaSourceShelf() {
  const values = await redisCommand<string[]>(["HVALS", stagingKey]);
  return (Array.isArray(values) ? values : [])
    .map(parseSourceEntry)
    .filter((entry): entry is TahoiyaSourceEntry => Boolean(entry));
}
