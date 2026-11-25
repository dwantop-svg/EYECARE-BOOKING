import { BookingForm } from './BookingForm';
import { PDPA_VERSION } from '@/lib/booking';
export const dynamic = 'force-dynamic';
export default function BookPage() {
  return <BookingForm pdpaVersion={PDPA_VERSION} />;
}
