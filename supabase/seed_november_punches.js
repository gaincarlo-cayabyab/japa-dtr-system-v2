const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://blmthmojjnonbmwitzmc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbXRobW9qam5vbmJtd2l0em1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDUzOTI3MCwiZXhwIjoyMTEwMTE1MjcwfQ.hsO_inZ9Faei67c5edyo4iGk9E96hMO5VYhiMKi9m6o'
);

const content = fs.readFileSync('c:/Users/gain carlo/Downloads/japa-dtr-system/markdown/Staff_Time_In_and_Out_November_2026.md', 'utf-8');

const nameToId = {
  'Estacio, Lyca': '7',
  'Soriano, Jamaica': '11',
  'Jewell H. [surname unclear]': '15',
  'Dee, Jerwin': '6',
  'Ardiente, Dennis': '1',
  'Baniqued, Jepoy': '2',
  'Caoile, Carlo': '3',
  'De Vera, Ivan': '5',
  'De Vera, Marly': '4',
  'Estacio, Larry': '8',
  'Galzote, Randolf John': '14',
  'Galvan, Janine Kyle': '9',
  'Warim [surname obscured]': '23',
  'Luna, Robert': '18',
  'Romero, Rowena': '13',
  'Sentinellar, Asky': '19',
  'Tiozon, Henry': '16',
  'Melanie [surname partly obscured]': '17'
};

const sections = content.split('### ');
let allPunches = [];

for (let s of sections.slice(1)) {
  const lines = s.split('\n');
  const rawName = lines[0].trim();
  const staffName = Object.keys(nameToId).find(k => rawName.startsWith(k));
  if (!staffName) continue;
  const devId = nameToId[staffName];

  for (let line of lines) {
    if (!line.startsWith('|') || line.includes('Recorded IN') || line.includes('---')) continue;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 6) continue;
    const dateStr = parts[1]; // e.g. 02 Nov 2026 (Mon)
    const inCol = parts[4];   // Rounded IN
    const outCol = parts[5];  // Rounded OUT

    const matchDate = dateStr.match(/^(\d{2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!matchDate) continue;
    const day = matchDate[1];
    const year = matchDate[3];
    const baseDate = `${year}-11-${day}`;

    function parseTime(tStr, isOut) {
      if (!tStr || tStr === '—' || tStr.toLowerCase().includes('review')) return null;
      let clean = tStr.replace(/^~/, '').trim();
      const isNextDay = clean.includes('(+1 day)');
      clean = clean.replace(/\(\+1 day\)/g, '').replace(/\(AM\/PM unclear\)/g, '').trim();

      const timeMatch = clean.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (!timeMatch) return null;
      let h = parseInt(timeMatch[1]);
      let m = parseInt(timeMatch[2]);
      let amp = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

      if (!amp) {
        if (isOut) {
          if (h < 12 && h >= 1) amp = 'PM';
          else if (h === 12) amp = 'AM'; // midnight if OT or unclear
        } else {
          amp = (h === 1) ? 'PM' : 'AM';
        }
      }

      if (amp === 'PM' && h < 12) h += 12;
      if (amp === 'AM' && h === 12) h = 0;

      let pDate = baseDate;
      if (isNextDay) {
        const dObj = new Date(`${baseDate}T00:00:00+08:00`);
        dObj.setDate(dObj.getDate() + 1);
        const y = dObj.getFullYear();
        const mm = String(dObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dObj.getDate()).padStart(2, '0');
        pDate = `${y}-${mm}-${dd}`;
      }

      const hStr = String(h).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');
      return `${pDate}T${hStr}:${mStr}:00+08:00`;
    }

    const inTime = parseTime(inCol, false);
    const outTime = parseTime(outCol, true);

    if (inTime) {
      allPunches.push({
        device_user_id: devId,
        punch_time: inTime,
        status: 0,
        synced_at: new Date().toISOString()
      });
    }
    if (outTime) {
      allPunches.push({
        device_user_id: devId,
        punch_time: outTime,
        status: 1,
        synced_at: new Date().toISOString()
      });
    }
  }
}

async function seed() {
  console.log(`Parsed ${allPunches.length} punches to seed.`);

  // 1. Clear existing attendance logs
  const { error: delErr } = await sb.from('attendance_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) {
    console.error('Error clearing old logs:', delErr);
  } else {
    console.log('Cleared existing attendance_logs.');
  }

  // 2. Batch insert (batches of 100)
  for (let i = 0; i < allPunches.length; i += 100) {
    const batch = allPunches.slice(i, i + 100);
    const { data, error } = await sb.from('attendance_logs').insert(batch);
    if (error) {
      console.error(`Error inserting batch ${i}:`, error);
    } else {
      console.log(`Inserted batch ${i + 1} to ${Math.min(i + 100, allPunches.length)}`);
    }
  }

  // 3. Count total logs in Supabase
  const { count } = await sb.from('attendance_logs').select('*', { count: 'exact', head: true });
  console.log(`Total attendance logs now in Supabase: ${count}`);
}

seed();
