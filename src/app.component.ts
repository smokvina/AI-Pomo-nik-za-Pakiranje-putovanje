import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, PackingList, Activity, TripDetails } from './services/gemini.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  // Form signals
  destination = signal('Dubrovnik');
  startDate = signal(this.getFutureDate(30));
  endDate = signal(this.getFutureDate(34));
  activities = signal<Activity[]>([
    { description: 'Prisustvovanje kongresu i poslovni sastanci', time: 'dan' },
    { description: 'Večernji izlasci i večere', time: 'noć' },
    { description: 'Razgledavanje grada', time: 'dan' }
  ]);
  // Advanced options signals
  formality = signal<'ležerno' | 'poslovno-ležerno' | 'formalno'>('poslovno-ležerno');
  lightLuggage = signal(false);

  // State signals
  packingList = signal<PackingList | null>(null);
  isLoading = signal(false);
  error = signal<string | null>(null);
  savedTripDetails = signal<{ destination: string; startDate: string; endDate: string; } | null>(null);
  actionMessage = signal<string | null>(null);
  
  // Computed signal for trip duration
  duration = computed(() => {
    const start = new Date(this.startDate());
    const end = new Date(this.endDate());
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return 0;
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // Including both start and end day
  });

  constructor() {
    this.loadSavedList();
  }

  private loadSavedList(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedList = localStorage.getItem('packingList');
        const savedDetails = localStorage.getItem('tripDetails');
        if (savedList && savedDetails) {
          this.packingList.set(JSON.parse(savedList));
          this.savedTripDetails.set(JSON.parse(savedDetails));
        }
      }
    } catch (e) {
      console.error('Greška pri učitavanju spremljenog popisa iz localStorage', e);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('packingList');
        localStorage.removeItem('tripDetails');
      }
    }
  }

  // Helper to get a future date for default values
  getFutureDate(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  addActivity(): void {
    this.activities.update(activities => [...activities, { description: '', time: 'dan' }]);
  }

  removeActivity(index: number): void {
    this.activities.update(activities => activities.filter((_, i) => i !== index));
  }

  async generatePackingList(): Promise<void> {
    if (this.duration() <= 0) {
      this.error.set('Molimo unesite ispravne datume putovanja.');
      return;
    }
    if (this.activities().some(a => a.description.trim() === '')) {
      this.error.set('Molimo opišite sve planirane aktivnosti.');
      return;
    }
    
    this.isLoading.set(true);
    this.error.set(null);
    this.packingList.set(null);
    this.savedTripDetails.set(null); // Clear saved view when generating new

    try {
      const list = await this.geminiService.generatePackingList({
        destination: this.destination(),
        startDate: this.startDate(),
        endDate: this.endDate(),
        duration: this.duration(),
        activities: this.activities(),
        formality: this.formality(),
        lightLuggage: this.lightLuggage()
      });
      this.packingList.set(list);
    } catch (e) {
      console.error(e);
      this.error.set('Došlo je do pogreške prilikom generiranja popisa. Molimo pokušajte ponovno.');
    } finally {
      this.isLoading.set(false);
    }
  }

  saveList(): void {
    const list = this.packingList();
    if (!list || typeof localStorage === 'undefined') return;

    try {
      const tripDetails = {
        destination: this.destination(),
        startDate: this.startDate(),
        endDate: this.endDate()
      };
      localStorage.setItem('packingList', JSON.stringify(list));
      localStorage.setItem('tripDetails', JSON.stringify(tripDetails));
      this.savedTripDetails.set(tripDetails);
      this.showActionMessage('Popis spremljen!');
    } catch (e) {
      console.error('Greška pri spremanju popisa u localStorage', e);
      this.error.set('Nije moguće spremiti popis. Vaš preglednik možda ne podržava localStorage ili je pun.');
    }
  }

  clearSavedList(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('packingList');
    localStorage.removeItem('tripDetails');
    this.packingList.set(null);
    this.savedTripDetails.set(null);
  }

  async shareList(): Promise<void> {
    const list = this.packingList();
    if (!list) return;

    const details = this.savedTripDetails() ?? { destination: this.destination(), startDate: this.startDate(), endDate: this.endDate() };
    let shareText = `Popis za pakiranje za put u ${details.destination} (${details.startDate} do ${details.endDate}):\n\n`;

    this.getPackingListKeys(list).forEach(categoryKey => {
      const categoryTitle = this.formatCategoryTitle(categoryKey);
      shareText += `--- ${categoryTitle} ---\n`;
      const items = list[categoryKey];
      if (categoryKey === 'prijedloziKombinacija') {
        (items as any[]).forEach((s: any) => {
          shareText += `Za: ${s.aktivnost} (${s.opis})\n  - ${s.odjevnaKombinacija.join('\n  - ')}\n`;
        });
      } else if (Array.isArray(items)) {
         shareText += items.join('\n');
      }
      shareText += '\n\n';
    });

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Popis za pakiranje za ${details.destination}`,
          text: shareText,
        });
      } catch (e) {
        console.error('Dijeljenje nije uspjelo', e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        this.showActionMessage('Popis kopiran!');
      } catch (e) {
        console.error('Kopiranje nije uspjelo', e);
        this.error.set('Nije moguće kopirati popis u međuspremnik.');
      }
    }
  }

  private showActionMessage(message: string): void {
    this.actionMessage.set(message);
    setTimeout(() => this.actionMessage.set(null), 3000);
  }

  // Helper to get keys from the packing list object for iteration in the template
  getPackingListKeys(packingList: PackingList | null): (keyof PackingList)[] {
    return packingList ? Object.keys(packingList) as (keyof PackingList)[] : [];
  }

  // Helper to format category titles
  formatCategoryTitle(key: string): string {
    const titles: { [key: string]: string } = {
      prijedloziKombinacija: 'Prijedlozi Odjevnih Kombinacija',
      osnovnaOdjeca: 'Osnovna Odjeća',
      obuca: 'Obuća',
      higijenskePotrepstine: 'Higijenske Potrepštine',
      dodaciElektronika: 'Dodaci i Elektronika',
      dokumentiNovac: 'Dokumenti i Novac'
    };
    return titles[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }
}