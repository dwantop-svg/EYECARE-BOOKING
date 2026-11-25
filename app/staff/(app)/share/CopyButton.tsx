'use client';
import { useState } from 'react';
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-primary" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); })}>
      {done ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
    </button>
  );
}
