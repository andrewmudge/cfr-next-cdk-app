/* eslint-disable jsx-a11y/alt-text -- react-pdf's <Image> has no alt prop */
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { CHRONICLE_NAME, issueInfo } from '@/lib/chronicle/issues';
import { getPhotoBuffer } from '@/lib/chronicle/storage';
import type { ChronicleEntry, ChronicleMeta } from '@/lib/chronicle/db';

// Built-in PDF fonts can't draw emoji, and family updates are full of them.
Font.registerEmojiSource({ format: 'png', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/' });
// Don't hyphenate names or words mid-line.
Font.registerHyphenationCallback((word) => [word]);

const RED = '#b91c1c';
const INK = '#1e293b';
const MUTED = '#64748b';

const PAGE_W = 612; // US Letter, points
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GAP = 10;
const HALF_W = (CONTENT_W - GAP) / 2;
const SINGLE_MAX_H = 400;
const GRID_H = 190;

const s = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 18, paddingHorizontal: MARGIN, fontFamily: 'Helvetica', fontSize: 11.5, color: INK, lineHeight: 1.45 },
  cover: { flexGrow: 1, justifyContent: 'center' },
  rule: { height: 3, backgroundColor: RED, marginVertical: 14 },
  title: { fontFamily: 'Times-Bold', fontSize: 44, textAlign: 'center', lineHeight: 1.1 },
  subtitle: { fontFamily: 'Times-Italic', fontSize: 18, textAlign: 'center', color: MUTED },
  intro: { fontFamily: 'Times-Roman', fontSize: 13, marginTop: 28, lineHeight: 1.55 },
  tocHeading: { fontFamily: 'Helvetica-Bold', fontSize: 10, letterSpacing: 1.5, color: RED, marginTop: 32, marginBottom: 6 },
  tocItem: { fontSize: 11, color: INK },
  entry: { marginBottom: 26 },
  name: { fontFamily: 'Times-Bold', fontSize: 20, color: RED, marginBottom: 4 },
  content: { fontSize: 11.5 },
  photos: { marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: GAP },
  half: { width: HALF_W, height: GRID_H, objectFit: 'cover', borderRadius: 3 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginTop: 4 },
  footer: { position: 'absolute', bottom: MARGIN / 2, left: MARGIN, right: MARGIN, flexDirection: 'row', justifyContent: 'space-between', fontSize: 9, color: MUTED },
  empty: { fontFamily: 'Times-Italic', fontSize: 14, textAlign: 'center', color: MUTED, marginTop: 120 },
});

type LoadedPhoto = { data: Buffer; width: number; height: number };
type LoadedEntry = ChronicleEntry & { loaded: LoadedPhoto[] };

const src = (p: LoadedPhoto) => ({ data: p.data, format: 'jpg' as const });

function Photos({ photos }: { photos: LoadedPhoto[] }) {
  if (photos.length === 0) return null;
  if (photos.length === 1) {
    const p = photos[0];
    const ratio = p.width && p.height ? p.height / p.width : 0.75;
    const h = Math.min(SINGLE_MAX_H, CONTENT_W * ratio);
    return (
      <View style={s.photos} wrap={false}>
        <Image src={src(p)} style={{ width: h / ratio, height: h, alignSelf: 'center', borderRadius: 3 }} />
      </View>
    );
  }
  const rows: LoadedPhoto[][] = [];
  for (let i = 0; i < photos.length; i += 2) rows.push(photos.slice(i, i + 2));
  return (
    <View style={s.photos}>
      {rows.map((row, i) => (
        <View key={i} style={s.row} wrap={false}>
          {row.map((p, j) => (
            <Image key={j} src={src(p)} style={s.half} />
          ))}
          {row.length === 1 && <View style={{ width: HALF_W }} />}
        </View>
      ))}
    </View>
  );
}

function ChronicleDocument({ meta, entries }: { meta: ChronicleMeta; entries: LoadedEntry[] }) {
  const info = issueInfo(meta.issueId);
  return (
    <Document title={`${CHRONICLE_NAME} — ${info.label}`} author="Churchwell Family Reunion" creator="churchwellreunion.com">
      <Page size="LETTER" style={s.page}>
        <View style={s.cover}>
          <Text style={s.title}>{CHRONICLE_NAME}</Text>
          <View style={s.rule} />
          <Text style={s.subtitle}>
            {info.label} · {info.dateLabel}
          </Text>
          {meta.intro ? <Text style={s.intro}>{meta.intro}</Text> : null}
          {entries.length > 0 && (
            <View>
              <Text style={s.tocHeading}>NEWS FROM</Text>
              {entries.map((e) => (
                <Text key={e.sk} style={s.tocItem}>
                  {e.displayName}
                </Text>
              ))}
            </View>
          )}
        </View>
        <Footer label={info.label} />
      </Page>

      <Page size="LETTER" style={s.page}>
        {entries.length === 0 && <Text style={s.empty}>No updates yet.</Text>}
        {entries.map((e, i) => (
          <View key={e.sk} style={s.entry}>
            {/* Keep the name with the start of the text: never strand a heading at a page bottom. */}
            <View wrap={false}>
              <Text style={s.name}>{e.displayName}</Text>
              {e.content ? <Text style={s.content}>{e.content}</Text> : null}
            </View>
            <Photos photos={e.loaded} />
            {i < entries.length - 1 && <View style={s.divider} />}
          </View>
        ))}
        <Footer label={info.label} />
      </Page>
    </Document>
  );
}

function Footer({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {CHRONICLE_NAME} · {label}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

/** Render the issue's approved entries (in order) to a PDF. */
export async function renderChroniclePdf(meta: ChronicleMeta, entries: ChronicleEntry[]): Promise<Buffer> {
  const loaded: LoadedEntry[] = [];
  // A handful of photos at a time keeps memory and S3 connections in check.
  for (const e of entries) {
    const photos = await Promise.all(
      e.photos.map(async (p) => {
        try {
          return { data: await getPhotoBuffer(p.key), width: p.width, height: p.height };
        } catch (err) {
          console.error('Chronicle PDF: could not load photo', p.key, err);
          return null;
        }
      })
    );
    loaded.push({ ...e, loaded: photos.filter((p): p is LoadedPhoto => !!p) });
  }
  return renderToBuffer(<ChronicleDocument meta={meta} entries={loaded} />);
}
