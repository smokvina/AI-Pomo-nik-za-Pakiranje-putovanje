import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

export interface Activity {
  description: string;
  time: 'dan' | 'noć';
}

export interface TripDetails {
  destination: string;
  startDate: string;
  endDate: string;
  duration: number;
  activities: Activity[];
  formality: 'ležerno' | 'poslovno-ležerno' | 'formalno';
  lightLuggage: boolean;
}

export interface OutfitSuggestion {
  aktivnost: string;
  opis: string;
  odjevnaKombinacija: string[];
}

export interface PackingList {
  prijedloziKombinacija: OutfitSuggestion[];
  osnovnaOdjeca: string[];
  obuca: string[];
  higijenskePotrepstine: string[];
  dodaciElektronika: string[];
  dokumentiNovac: string[];
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private genAI: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generatePackingList(details: TripDetails): Promise<PackingList> {
    const model = this.genAI.models;

    const activitiesString = details.activities.map(a => `- ${a.description} (${a.time === 'dan' ? 'dnevna' : 'večernja'} aktivnost)`).join('\n');

    let advancedInstructions = '';
    if (details.formality) {
      advancedInstructions += `\n- Prilagodi stil odjeće traženoj razini formalnosti: ${details.formality}.`;
    }
    if (details.lightLuggage) {
      advancedInstructions += `\n- Posebno se fokusiraj na minimalizam i predloži višenamjenske odjevne predmete kako bi prtljaga bila što lakša. Smanji količine gdje je to moguće.`;
    }

    const prompt = `
      Ti si stručni asistent za pakiranje za putovanja. Kreiraj detaljan i praktičan popis za pakiranje na hrvatskom jeziku za putovanje sa sljedećim detaljima:
      - Destinacija: ${details.destination}
      - Datumi: Od ${details.startDate} do ${details.endDate} (${details.duration} dana)
      - Planirane aktivnosti:
      ${activitiesString}
      ${advancedInstructions ? `- Dodatne upute:${advancedInstructions}` : ''}
      
      Upute:
      1.  Analiziraj destinaciju i datume kako bi predvidio vjerojatno vrijeme (npr. temperatura, kiša, snijeg). Tvoja saznanja o vremenu ugradi u preporuke.
      2.  Na temelju vremena, trajanja putovanja, planiranih aktivnosti i dodatnih uputa, generiraj prijedloge odjevnih kombinacija za SVAKU navedenu aktivnost.
      3.  Zatim, kreiraj sveobuhvatan popis za pakiranje, grupiran po kategorijama.
      4.  Predloži količine gdje je prikladno (npr., "Čarape (x${details.duration})"). Ako je zatražena lagana prtljaga, optimiziraj količine.
      5.  Cijeli izlaz mora biti na hrvatskom jeziku.
      6.  Strogo se pridržavaj priložene JSON sheme. Sva polja moraju biti popunjena relevantnim stavkama. Ako kategorija nije relevantna, navedi prazan niz.
    `;
    
    const response = await model.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    prijedloziKombinacija: {
                        type: Type.ARRAY,
                        description: 'Prijedlozi odjevnih kombinacija za svaku planiranu aktivnost.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                aktivnost: { type: Type.STRING, description: 'Naziv aktivnosti preuzet iz prompta.'},
                                opis: { type: Type.STRING, description: 'Kratak opis predložene odjevne kombinacije i zašto je prikladna.'},
                                odjevnaKombinacija: {
                                    type: Type.ARRAY,
                                    description: 'Popis odjevnih predmeta koji čine kombinaciju.',
                                    items: { type: Type.STRING }
                                }
                            },
                            required: ['aktivnost', 'opis', 'odjevnaKombinacija']
                        }
                    },
                    osnovnaOdjeca: {
                        type: Type.ARRAY,
                        description: 'Osnovna, poslovna i ležerna odjeća (majice, hlače, donje rublje, odijela). Ne ponavljati stavke iz prijedloga kombinacija.',
                        items: { type: Type.STRING }
                    },
                    obuca: {
                        type: Type.ARRAY,
                        description: 'Obuća prikladna za aktivnosti i vrijeme.',
                        items: { type: Type.STRING }
                    },
                    higijenskePotrepstine: {
                        type: Type.ARRAY,
                        description: 'Osobna higijena i kozmetika.',
                        items: { type: Type.STRING }
                    },
                    dodaciElektronika: {
                        type: Type.ARRAY,
                        description: 'Dodaci, elektronika i ostale korisne stvari.',
                        items: { type: Type.STRING }
                    },
                    dokumentiNovac: {
                        type: Type.ARRAY,
                        description: 'Važni dokumenti, novac i kartice.',
                        items: { type: Type.STRING }
                    }
                },
                required: ['prijedloziKombinacija', 'osnovnaOdjeca', 'obuca', 'higijenskePotrepstine', 'dodaciElektronika', 'dokumentiNovac']
            }
        }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as PackingList;
  }
}