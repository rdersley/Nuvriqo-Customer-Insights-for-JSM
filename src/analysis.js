const STOP = new Set(`about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with would you your yours a au aux avec ces dans de des du elle en est et eux il je la le les leur lui ma mais mes moi mon ne nos notre nous on ou par pas pour qu que quel quelle quels qui sa sans se ses son sur ta te tes toi ton tu un une vos votre vous c est d l j n s m`.split(/\s+/));

function strings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, output));
  return output;
}

export function tokenize(issue) {
  const summary = issue.fields?.summary || issue.summary || '';
  const description = strings(issue.fields?.description ?? issue.description).join(' ');
  const norm = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = (s) => norm(s).match(/[a-z0-9]{3,}/g) || [];
  const summaryWords = words(summary).filter((w) => !STOP.has(w));
  const descriptionWords = words(description).filter((w) => !STOP.has(w));
  const weights = new Map();
  summaryWords.forEach((w) => weights.set(w, (weights.get(w) || 0) + 2));
  descriptionWords.forEach((w) => weights.set(w, Math.max(weights.get(w) || 0, 1)));
  let total = 0;
  for (const weight of weights.values()) total += weight;
  return { summary, weights, summaryWords, summarySet: new Set(summaryWords), total };
}

// Weighted Jaccard. Called for every pair of tickets, so it is kept cheap: the
// summary check rejects most pairs first, and sum(max) = sumA + sumB - sum(min)
// avoids building a union of keys.
function similarity(a, b) {
  let summaryOverlap = 0;
  for (const word of a.summaryWords) if (b.summarySet.has(word)) summaryOverlap += 1;
  if (summaryOverlap < 1) return 0;
  // ids are sorted word numbers (see indexWords), so intersect by merging.
  let intersection = 0;
  for (let i = 0, j = 0; i < a.ids.length && j < b.ids.length;) {
    if (a.ids[i] === b.ids[j]) { intersection += Math.min(a.ws[i], b.ws[j]); i += 1; j += 1; }
    else if (a.ids[i] < b.ids[j]) i += 1;
    else j += 1;
  }
  const union = a.total + b.total - intersection;
  if (!union) return 0;
  return (intersection / union) * (summaryOverlap >= 2 ? 1.18 : 1);
}

function themeName(members) {
  const counts = new Map();
  for (const { tokenized } of members) {
    for (const [word, weight] of tokenized.weights) counts.set(word, (counts.get(word) || 0) + weight);
  }
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word]) => word);
  return keywords.length ? keywords.map((word) => word[0].toUpperCase() + word.slice(1)).join(' · ') : 'Similar requests';
}

/** Adds sorted word-number arrays so similarity() can merge instead of hashing. */
function indexWords(rows) {
  const vocabulary = new Map();
  for (const { tokenized } of rows) {
    const pairs = [...tokenized.weights].map(([word, weight]) => {
      if (!vocabulary.has(word)) vocabulary.set(word, vocabulary.size);
      return [vocabulary.get(word), weight];
    }).sort((x, y) => x[0] - y[0]);
    tokenized.ids = Int32Array.from(pairs, ([id]) => id);
    tokenized.ws = Float64Array.from(pairs, ([, weight]) => weight);
  }
}

/** Deterministic, explainable similarity grouping. Bounded for interactive use. */
export function groupIssues(issues, threshold = 0.31) {
  const rows = issues.slice(0, 900).map((issue) => ({ issue, tokenized: tokenize(issue) }));
  indexWords(rows);
  const parent = rows.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (similarity(rows[i].tokenized, rows[j].tokenized) >= threshold) join(i, j);
    }
  }
  const buckets = new Map();
  rows.forEach((row, index) => {
    const root = find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(row);
  });
  return [...buckets.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const ordered = members.map(({ issue }) => issue).sort((a, b) => Date.parse(b.fields.created) - Date.parse(a.fields.created));
      return {
        id: ordered.map((issue) => issue.key).sort().join('-'),
        theme: themeName(members),
        count: ordered.length,
        tickets: ordered.slice(0, 8).map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary || '(No summary)',
          status: issue.fields.status?.name || 'Unknown',
          created: issue.fields.created,
          url: issue.self ? issue.self.replace(/\/rest\/api\/.*$/, '/browse/' + issue.key) : issue.key,
        })),
        sampleSummary: ordered[0].fields.summary || '(No summary)',
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
