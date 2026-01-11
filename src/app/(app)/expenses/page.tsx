import { redirect } from 'next/navigation';

// Expenses has been merged into Finance module
export default function ExpensesPage() {
  redirect('/accounting');
}
