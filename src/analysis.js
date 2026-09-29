const STOP = new Set(`about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with would you your yours a au aux avec ces dans de des du elle en est et eux il je la le les leur lui ma mais mes moi mon ne nos notre nous on ou par pas pour qu que quel quelle quels qui sa sans se ses son sur ta te tes toi ton tu un une vos votre vous c est d l j n s m`.split(/\s+/));

// Words that say nothing about which problem a ticket is about.
const GENERIC = new Set('issue issues problem problems please help request ticket hello thanks thank regards team kind dear will cannot cant need'.split(' '));
// "RYR - KURVIK - PFO - DEVICE CRASHES": customer, crew and airport codes are
// single all-caps tokens. They identify who and where, not what went wrong.
const CODE_SEGMENT = /^[A-Z0-9]{2,8}$/;

/** Visible text of a plain string or an Atlassian Document Format node. */
function textOf(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => textOf(item, output));
  else if (value && typeof value === 'object') {
    if (typeof value.text === 'string') output.push(value.text);
    if (value.content) textOf(value.content, output);
  }
  return output;
}

/** Summary without its code segments. The last segment is kept: it is usually the problem. */
export function problemText(summary) {
  const segments = summary.split(/\s+[-\u2013\u2014|:]\s+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return summary;
  return segments.filter((s, i) => i === segments.length - 1 || !CODE_SEGMENT.test(s)).join(' ');
}

function words(text) {
  const norm = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [...new Set((norm.match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w) && !GENERIC.has(w)))];
}

export function tokenize(issue) {
  const summary = issue.fields?.summary || issue.summary || '';
  return {
    summary,
    summaryWords: words(problemText(summary)),
    descriptionWords: words(textOf(issue.fields?.description ?? issue.description).join(' ')),
  };
}

const SUMMARY_WEIGHT = 3;
// Words in more than this share of a batch are template text or prefixes.
const MAX_SHARE = 0.5;

/**
 * TF-IDF vectors over the batch. Words that appear in most tickets are
 * dropped, rare words count more, and summary words count three times as much
 * as description words.
 */
function vectorise(rows) {
  const df = new Map();
  for (const { tokenized } of rows) {
    for (const word of new Set([...tokenized.summaryWords, ...tokenized.descriptionWords])) df.set(word, (df.get(word) || 0) + 1);
  }
  const n = rows.length;
  const tooCommon = (word) => n >= 6 && df.get(word) > n * MAX_SHARE;
  // A word only one ticket uses can't match anything, so it mostly dilutes.
  const idf = (word) => Math.log(1 + n / df.get(word)) * (n >= 6 && df.get(word) === 1 ? 0.5 : 1);
  for (const { tokenized } of rows) {
    const vector = new Map();
    tokenized.summaryWords = tokenized.summaryWords.filter((w) => !tooCommon(w));
    for (const w of tokenized.summaryWords) vector.set(w, SUMMARY_WEIGHT * idf(w));
    for (const w of tokenized.descriptionWords) if (!tooCommon(w) && !vector.has(w)) vector.set(w, idf(w));
    let squared = 0;
    for (const x of vector.values()) squared += x * x;
    tokenized.vector = vector;
    tokenized.norm = Math.sqrt(squared);
  }
}

function newCluster(row) {
  const cluster = { members: [], centroid: new Map(), squared: 0, summaryWords: new Set() };
  addToCluster(cluster, row);
  return cluster;
}

function addToCluster(cluster, row) {
  cluster.members.push(row);
  for (const [word, x] of row.tokenized.vector) {
    const old = cluster.centroid.get(word) || 0;
    cluster.centroid.set(word, old + x);
    cluster.squared += (old + x) ** 2 - old ** 2;
  }
  row.tokenized.summaryWords.forEach((w) => cluster.summaryWords.add(w));
}

function cosineToCluster(row, cluster) {
  if (!row.tokenized.norm || !cluster.squared) return 0;
  let dot = 0;
  for (const [word, x] of row.tokenized.vector) dot += x * (cluster.centroid.get(word) || 0);
  return dot / (row.tokenized.norm * Math.sqrt(cluster.squared));
}

/** The words most members' summaries share, in the order the best example uses them. */
function themeName(members, representative) {
  const counts = new Map();
  for (const { tokenized } of members) tokenized.summaryWords.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  let shared = representative.tokenized.summaryWords.filter((w) => counts.get(w) * 2 > members.length);
  if (!shared.length) shared = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  const text = shared.slice(0, 4).join(' ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'Similar requests';
}

/**
 * Deterministic, explainable grouping. Each ticket joins the cluster whose
 * centroid it is most like (and shares a summary word with), or starts its own.
 * Comparing with the whole cluster, not single tickets, stops one loose match
 * from chaining unrelated tickets together. Bounded for interactive use.
 */
export function groupIssues(issues, threshold = 0.4) {
  const rows = issues.slice(0, 900).map((issue) => ({ issue, tokenized: tokenize(issue) }));
  vectorise(rows);
  rows.sort((a, b) => Date.parse(a.issue.fields.created) - Date.parse(b.issue.fields.created));
  const clusters = [];
  const bySummaryWord = new Map();
  for (const row of rows) {
    const candidates = new Set();
    for (const w of row.tokenized.summaryWords) for (const c of bySummaryWord.get(w) || []) candidates.add(c);
    let best = null;
    let bestScore = threshold;
    for (const cluster of candidates) {
      const score = cosineToCluster(row, cluster);
      if (score >= bestScore) { best = cluster; bestScore = score; }
    }
    const target = best || newCluster(row);
    if (best) addToCluster(best, row);
    else clusters.push(target);
    for (const w of row.tokenized.summaryWords) {
      if (!bySummaryWord.has(w)) bySummaryWord.set(w, new Set());
      bySummaryWord.get(w).add(target);
    }
  }
  return clusters
    .filter((cluster) => cluster.members.length > 1)
    .map(({ members, ...cluster }) => {
      const representative = members.reduce((a, b) => (cosineToCluster(b, cluster) > cosineToCluster(a, cluster) ? b : a));
      const ordered = members.map(({ issue }) => issue).sort((a, b) => Date.parse(b.fields.created) - Date.parse(a.fields.created));
      return {
        id: ordered.map((issue) => issue.key).sort().join('-'),
        theme: themeName(members, representative),
        count: ordered.length,
        tickets: ordered.slice(0, 8).map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary || '(No summary)',
          status: issue.fields.status?.name || 'Unknown',
          created: issue.fields.created,
          url: issue.self ? issue.self.replace(/\/rest\/api\/.*$/, '/browse/' + issue.key) : issue.key,
        })),
        sampleSummary: representative.issue.fields.summary || '(No summary)',
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function buildReport(issues, periodStart, periodEnd) {
  const from = Date.parse(periodStart);
  const to = Date.parse(periodEnd + 'T23:59:59Z');
  const duration = Math.max(1, to - from);
  const current = issues.filter((issue) => {
    const t = Date.parse(issue.fields.created);
    return t >= from && t <= to;
  });
  const previous = issues.filter((issue) => {
    const t = Date.parse(issue.fields.created);
    return t >= from - duration && t < from;
  });
  const currentGroups = groupIssues(current);
  const previousGroups = groupIssues(previous);
  const oldCounts = new Map();
  const normalizedWords = (theme) => new Set(theme.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const trends = currentGroups.map((group) => {
    const currentWords = normalizedWords(group.theme);
    let prior = 0;
    let bestScore = 0;
    let bestIndex = -1;
    previousGroups.forEach((oldGroup, index) => {
      if (oldCounts.has(index)) return;
      const oldWords = normalizedWords(oldGroup.theme);
      const intersection = [...currentWords].filter((word) => oldWords.has(word)).length;
      const score = intersection / Math.max(1, new Set([...currentWords, ...oldWords]).size);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex >= 0 && bestScore >= 0.5) {
      prior = previousGroups[bestIndex].count;
      oldCounts.set(bestIndex, true);
    }
    return { ...group, previousCount: prior, change: group.count - prior, changePercent: prior ? Math.round(((group.count - prior) / prior) * 100) : null };
  });
  const buckets = new Map();
  const rangeDays = duration / 86400000;
  const bucketFor = (date) => {
    const d = new Date(date);
    if (rangeDays <= 35) return d.toISOString().slice(0, 10);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  };
  for (const issue of current) {
    const key = bucketFor(issue.fields.created);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (rangeDays <= 35) {
    for (let day = 0; day <= Math.floor((Date.parse(periodEnd) - Date.parse(periodStart)) / 86400000); day += 1) {
      const date = new Date(from + day * 86400000).toISOString().slice(0, 10);
      if (!buckets.has(date)) buckets.set(date, 0);
    }
  } else {
    const cursor = new Date(bucketFor(periodStart));
    const last = new Date(bucketFor(periodEnd));
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      if (!buckets.has(date)) buckets.set(date, 0);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }
  return {
    currentCount: current.length,
    previousCount: previous.length,
    change: current.length - previous.length,
    changePercent: previous.length ? Math.round(((current.length - previous.length) / previous.length) * 100) : null,
    groups: trends,
    timeSeries: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    analyzedCount: Math.min(current.length, 900),
    capped: current.length > 900 || previous.length > 900,
  };
}
