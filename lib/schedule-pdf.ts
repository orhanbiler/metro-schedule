import { toast } from 'sonner';
import { extractRankFromOfficerName, calculateOfficerPayRate, calculateHoursFromTimeString } from '@/lib/utils';

interface Officer {
  name: string;
  customHours?: string;
}

interface TimeSlot {
  id: string;
  date: Date;
  dayName: string;
  morningSlot: { time: string; officers: Officer[] };
  afternoonSlot: { time: string; officers: Officer[] };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatSlotDate(date: Date): string {
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
}

function normalizeOfficerName(name: string): string {
  const idMatch = name.match(/#(\d+)/);
  const id = idMatch ? idMatch[1] : '';
  const normalized = name.startsWith('Officer ') ? name.replace(/^Officer\s+/, 'Ofc. ') : name;
  const nameMatch = normalized.match(/(?:Ofc\.|PFC\.|Cpl\.|Sgt\.|Lt\.|Capt\.|Chief)\.?\s+([A-Za-z]+)/i);
  const lastName = nameMatch ? nameMatch[1] : normalized;
  return `${lastName.toUpperCase()}_${id}`;
}

function standardizeDisplayName(name: string): string {
  return name.startsWith('Officer ') ? name.replace(/^Officer\s+/, 'Ofc. ') : name;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildPdfHeader(doc: any, month: number, year: number, subtitle: string): Promise<void> {
  const logoImg = new Image();
  logoImg.src = '/logo-cool.png';
  await new Promise<void>((resolve) => { logoImg.onload = () => resolve(); });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.addImage(logoImg, 'PNG', 20, 15, 30, 30);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('CHEVERLY POLICE DEPARTMENT', 60, 25);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 60, 35);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${MONTH_NAMES[month]} ${year}`, 60, 45);
  doc.setLineWidth(0.5);
  doc.line(20, 55, pageWidth - 20, 55);
}

export async function generateSchedulePDF(
  schedule: TimeSlot[],
  selectedMonth: number,
  selectedYear: number
): Promise<void> {
  if (!schedule || schedule.length === 0) {
    toast.error('No schedule data available to export. Please wait for the schedule to load.');
    return;
  }

  const toastId = toast.loading('Generating PDF...');

  try {
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();

    await buildPdfHeader(doc, selectedMonth, selectedYear, 'Metro Overtime Schedule');

    const tableData: Array<[string, string, string]> = [];
    let totalHoursWorked = 0;
    const officerPayments: Record<string, {
      displayName: string;
      hours: number;
      rate: number;
      payment: number;
    }> = {};

    schedule.forEach((slot) => {
      const hasMorning = slot.morningSlot.officers.length > 0;
      const hasAfternoon = slot.afternoonSlot.officers.length > 0;
      if (!hasMorning && !hasAfternoon) return;

      let dayShown = false;

      if (hasMorning) {
        slot.morningSlot.officers.forEach((officer) => {
          const displayTime = officer.customHours ||
            `${slot.morningSlot.time.slice(0, 2)}:${slot.morningSlot.time.slice(2, 4)}-${slot.morningSlot.time.slice(5, 7)}:${slot.morningSlot.time.slice(7, 9)}`;
          const hours = calculateHoursFromTimeString(officer.customHours || slot.morningSlot.time);
          totalHoursWorked += hours;
          const key = normalizeOfficerName(officer.name);
          const rank = extractRankFromOfficerName(officer.name);
          const rate = calculateOfficerPayRate(rank);
          if (!officerPayments[key]) {
            officerPayments[key] = { displayName: standardizeDisplayName(officer.name), hours: 0, rate, payment: 0 };
          }
          officerPayments[key].hours += hours;
          officerPayments[key].payment += hours * rate;
          tableData.push([!dayShown ? `${slot.dayName} ${formatSlotDate(slot.date)}` : '', displayTime, officer.name]);
          dayShown = true;
        });
      }

      if (hasAfternoon) {
        slot.afternoonSlot.officers.forEach((officer) => {
          const displayTime = officer.customHours ||
            `${slot.afternoonSlot.time.slice(0, 2)}:${slot.afternoonSlot.time.slice(2, 4)}-${slot.afternoonSlot.time.slice(5, 7)}:${slot.afternoonSlot.time.slice(7, 9)}`;
          const hours = calculateHoursFromTimeString(officer.customHours || slot.afternoonSlot.time);
          totalHoursWorked += hours;
          const key = normalizeOfficerName(officer.name);
          const rank = extractRankFromOfficerName(officer.name);
          const rate = calculateOfficerPayRate(rank);
          if (!officerPayments[key]) {
            officerPayments[key] = { displayName: standardizeDisplayName(officer.name), hours: 0, rate, payment: 0 };
          }
          officerPayments[key].hours += hours;
          officerPayments[key].payment += hours * rate;
          tableData.push([
            !dayShown ? `${slot.dayName} ${formatSlotDate(slot.date)}` : '',
            hasAfternoon && hasMorning ? `and/or ${displayTime}` : displayTime,
            officer.name,
          ]);
          dayShown = true;
        });
      }
    });

    autoTable(doc, {
      head: [['DATE', 'TIME', 'OFFICER ASSIGNMENT']],
      body: tableData,
      startY: 60,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 7, cellPadding: 1.5, minCellHeight: 6, lineWidth: 0.1, lineColor: [200, 200, 200], font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      headStyles: { fillColor: [25, 35, 120], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center', minCellHeight: 8, cellPadding: 2 },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 45, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 'auto', halign: 'left' },
      },
      tableLineColor: [180, 180, 180],
      tableLineWidth: 0.15,
      rowPageBreak: 'avoid',
    });

    // @ts-ignore jspdf-autotable adds lastAutoTable property at runtime
    const finalY = doc.lastAutoTable?.finalY || 180;
    const summaryY = finalY + 15;
    let currentY: number;
    if (summaryY > 220) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Summary', 20, 20);
      currentY = 35;
    } else {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Summary', 20, summaryY);
      currentY = summaryY + 15;
    }

    const paymentTableData: Array<[string, string, string, string, string]> = [];
    let grandTotal = 0;
    Object.entries(officerPayments)
      .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
      .forEach(([, data]) => {
        paymentTableData.push([
          data.displayName,
          `${data.hours}`,
          `$${data.rate.toFixed(2)}`,
          `$${data.payment.toFixed(2)}`,
          extractRankFromOfficerName(data.displayName) || 'Unknown',
        ]);
        grandTotal += data.payment;
      });

    autoTable(doc, {
      head: [['OFFICER', 'HOURS', 'RATE/HR', 'TOTAL PAY', 'RANK']],
      body: paymentTableData,
      startY: currentY,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 7, lineWidth: 0.1, lineColor: [200, 200, 200], font: 'helvetica' },
      headStyles: { fillColor: [25, 35, 120], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 65, halign: 'left' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 35, halign: 'center' },
      },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10 },
      foot: [['GRAND TOTAL', `${totalHoursWorked}`, '', `$${grandTotal.toFixed(2)}`, '']],
    });

    // @ts-ignore jspdf-autotable adds lastAutoTable property at runtime
    const paymentTableY = doc.lastAutoTable?.finalY || 100;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Pay Rates: Sgt. and above = $65/hr | Below Sgt. = $60/hr', 20, paymentTableY + 10);
    doc.setTextColor(0, 0, 0);

    doc.save(`metro-schedule-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
    toast.dismiss(toastId);
    toast.success('PDF exported successfully!');
  } catch (error) {
    console.error('PDF generation error:', error);
    toast.dismiss(toastId);
    toast.error('Failed to generate PDF. Please try again.');
  }
}

export async function generateBillablePDF(
  schedule: TimeSlot[],
  selectedMonth: number,
  selectedYear: number
): Promise<void> {
  if (!schedule || schedule.length === 0) {
    toast.error('No schedule data available to export. Please wait for the schedule to load.');
    return;
  }

  const toastId = toast.loading('Generating billable PDF...');

  try {
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();

    await buildPdfHeader(doc, selectedMonth, selectedYear, 'Metro Overtime Schedule - Billable');

    const tableData: Array<[string, string, string]> = [];
    let totalHoursWorked = 0;
    const officerPayments: Record<string, {
      displayName: string;
      hours: number;
      rate: number;
      payment: number;
      billableRate: number;
      billableAmount: number;
    }> = {};

    schedule.forEach((slot) => {
      const hasMorning = slot.morningSlot.officers.length > 0;
      const hasAfternoon = slot.afternoonSlot.officers.length > 0;
      if (!hasMorning && !hasAfternoon) return;

      let dayShown = false;

      if (hasMorning) {
        slot.morningSlot.officers.forEach((officer) => {
          const displayTime = officer.customHours ||
            `${slot.morningSlot.time.slice(0, 2)}:${slot.morningSlot.time.slice(2, 4)}-${slot.morningSlot.time.slice(5, 7)}:${slot.morningSlot.time.slice(7, 9)}`;
          const hours = calculateHoursFromTimeString(officer.customHours || slot.morningSlot.time);
          totalHoursWorked += hours;
          const key = normalizeOfficerName(officer.name);
          const rank = extractRankFromOfficerName(officer.name);
          const baseRate = calculateOfficerPayRate(rank);
          const billableRate = baseRate + 10;
          if (!officerPayments[key]) {
            officerPayments[key] = { displayName: standardizeDisplayName(officer.name), hours: 0, rate: baseRate, payment: 0, billableRate, billableAmount: 0 };
          }
          officerPayments[key].hours += hours;
          officerPayments[key].payment += hours * baseRate;
          officerPayments[key].billableAmount += hours * billableRate;
          tableData.push([!dayShown ? `${slot.dayName} ${formatSlotDate(slot.date)}` : '', displayTime, officer.name]);
          dayShown = true;
        });
      }

      if (hasAfternoon) {
        slot.afternoonSlot.officers.forEach((officer) => {
          const displayTime = officer.customHours ||
            `${slot.afternoonSlot.time.slice(0, 2)}:${slot.afternoonSlot.time.slice(2, 4)}-${slot.afternoonSlot.time.slice(5, 7)}:${slot.afternoonSlot.time.slice(7, 9)}`;
          const hours = calculateHoursFromTimeString(officer.customHours || slot.afternoonSlot.time);
          totalHoursWorked += hours;
          const key = normalizeOfficerName(officer.name);
          const rank = extractRankFromOfficerName(officer.name);
          const baseRate = calculateOfficerPayRate(rank);
          const billableRate = baseRate + 10;
          if (!officerPayments[key]) {
            officerPayments[key] = { displayName: standardizeDisplayName(officer.name), hours: 0, rate: baseRate, payment: 0, billableRate, billableAmount: 0 };
          }
          officerPayments[key].hours += hours;
          officerPayments[key].payment += hours * baseRate;
          officerPayments[key].billableAmount += hours * billableRate;
          tableData.push([
            !dayShown ? `${slot.dayName} ${formatSlotDate(slot.date)}` : '',
            hasAfternoon && hasMorning ? `and/or ${displayTime}` : displayTime,
            officer.name,
          ]);
          dayShown = true;
        });
      }
    });

    autoTable(doc, {
      head: [['DATE', 'TIME', 'OFFICER ASSIGNMENT']],
      body: tableData,
      startY: 60,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 7, cellPadding: 1.5, minCellHeight: 6, lineWidth: 0.1, lineColor: [200, 200, 200], font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      headStyles: { fillColor: [25, 35, 120], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center', minCellHeight: 8, cellPadding: 2 },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 45, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 'auto', halign: 'left' },
      },
      tableLineColor: [180, 180, 180],
      tableLineWidth: 0.15,
      rowPageBreak: 'avoid',
    });

    // @ts-ignore jspdf-autotable adds lastAutoTable property at runtime
    const finalY = doc.lastAutoTable?.finalY || 180;
    const summaryY = finalY + 15;
    let currentY: number;
    if (summaryY > 220) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Billable Payment Summary', 20, 20);
      currentY = 35;
    } else {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Billable Payment Summary', 20, summaryY);
      currentY = summaryY + 15;
    }

    const paymentTableData: Array<[string, string, string]> = [];
    let billableGrandTotal = 0;
    Object.entries(officerPayments)
      .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
      .forEach(([, data]) => {
        paymentTableData.push([data.displayName, `${data.hours}`, `$${data.billableAmount.toFixed(2)}`]);
        billableGrandTotal += data.billableAmount;
      });

    autoTable(doc, {
      head: [['OFFICER', 'HOURS', 'BILLABLE AMOUNT']],
      body: paymentTableData,
      startY: currentY,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 7, lineWidth: 0.1, lineColor: [200, 200, 200], font: 'helvetica' },
      headStyles: { fillColor: [25, 35, 120], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 90, halign: 'left' },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
      },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10 },
      foot: [['BILLABLE TOTAL', `${totalHoursWorked}`, `$${billableGrandTotal.toFixed(2)}`]],
    });

    // @ts-ignore jspdf-autotable adds lastAutoTable property at runtime
    const paymentTableY = doc.lastAutoTable?.finalY || 100;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL BILLABLE AMOUNT: $${billableGrandTotal.toFixed(2)}`, 20, paymentTableY + 15);

    doc.save(`metro-schedule-billable-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
    toast.dismiss(toastId);
    toast.success('Billable PDF exported successfully!');
  } catch (error) {
    console.error('Billable PDF generation error:', error);
    toast.dismiss(toastId);
    toast.error('Failed to generate billable PDF. Please try again.');
  }
}
