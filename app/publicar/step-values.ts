import type { SuggestionVocabulary } from "../../src/modules/listing-catalogue/domain/suggest-filters";
import type {
  DraftListingValues,
  DraftPhoto,
  PublicationDraft,
  PublishStepId,
} from "../../src/modules/listing-publication/domain/publication-steps";
import { resolveZoneCity } from "../../src/modules/listing-publication/domain/zone-search";

/**
 * Lo que un navegador posteo, traducido al vocabulario del borrador.
 *
 * **Nada se decide aca que el dominio decida.** Un precio escrito
 * "quinientos" sale como `NaN`, que `validatePublishableListing` ya rechaza
 * como `priceUsd.invalid`; traducirlo a 0 publicaria un alquiler gratis por
 * un error de tipeo. Lo unico que esta capa resuelve es la forma: `FormData`
 * habla en cadenas y el dominio en numeros y booleanos.
 *
 * **Cada paso lee unicamente sus propios campos**, y eso es la mitad de
 * "volver no borra lo que sigue" que vive en la entrega. La otra mitad es
 * `applyStepAnswers`, que solo escribe los campos del paso. Las dos juntas
 * hacen que postear el formulario entero contra el paso 3 no pueda pisar el
 * titulo ni el contacto.
 *
 * Pura: entra un `FormData` y el vocabulario, sale un fragmento de borrador.
 * Sin sesion, sin base, sin red — por eso se puede probar sin ninguna.
 */

/** Lo tecleado, para mostrarlo al lado de su mensaje despues del redirect. */
export type RawValues = Record<string, string>;

export interface StepAnswers {
  readonly answers: PublicationDraft;
  readonly raw: RawValues;
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * `undefined` para un campo vacio, **nunca 0**.
 *
 * `Number("")` es 0, y ese cero silencioso es la diferencia entre pedir el
 * precio y publicar un alquiler gratis. `NaN` para lo que no es un numero se
 * deja pasar a proposito: es lo que el validador convierte en un mensaje que
 * dice que escribir.
 */
function count(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  return raw === undefined ? undefined : Number(raw);
}

/** Una casilla marcada llega como "on"; ausente no llega. */
function checked(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

function rawOf(formData: FormData, keys: readonly string[]): RawValues {
  const raw: RawValues = {};
  for (const key of keys) {
    const value = text(formData, key);
    if (value !== undefined) raw[key] = value;
  }
  return raw;
}

/**
 * Las fotos que el subidor dejo en campos ocultos.
 *
 * El nombre y el tamano viajan al lado de la clave porque la pantalla de
 * revisar los muestra ("3 fotos · 449 KB") y no hay forma de recuperarlos
 * despues sin volver a bajar los archivos. La clave se vuelve a verificar
 * contra la sesion al publicar, asi que nada de esto es una afirmacion sobre
 * de quien es la foto.
 */
function readPhotos(formData: FormData): readonly DraftPhoto[] {
  const keys = formData.getAll("photoKey");
  const names = formData.getAll("photoName");
  const sizes = formData.getAll("photoBytes");

  const photos: DraftPhoto[] = [];
  for (const [index, entry] of keys.entries()) {
    if (typeof entry !== "string" || entry.trim() === "") continue;

    const name = names[index];
    const bytes = sizes[index];
    photos.push({
      key: entry,
      name: typeof name === "string" && name !== "" ? name : "Foto",
      bytes: typeof bytes === "string" ? Number(bytes) || 0 : 0,
    });
  }
  return photos;
}

function draft(listing: DraftListingValues, extra: Partial<PublicationDraft> = {}): StepAnswers {
  return { answers: { listing, photos: [], ...extra }, raw: {} };
}

export function readStepAnswers(
  stepId: PublishStepId,
  formData: FormData,
  vocabulary: SuggestionVocabulary,
): StepAnswers {
  switch (stepId) {
    case "tipo":
      // Sin valor por defecto, aca y en ninguna parte.
      return draft({
        propertyType: text(formData, "propertyType") as DraftListingValues["propertyType"],
      });

    case "zona": {
      // **La ciudad la determina la zona.** Nunca se pregunta, asi que
      // tampoco se lee: se busca. Una zona que no esta en el catalogo no
      // arrastra ciudad, porque inventarla empujaria contra la clave foranea
      // compuesta de `listing` un par que la base rechaza — un 500 donde
      // corresponde un error de formulario.
      const selection = resolveZoneCity(text(formData, "zoneId"), vocabulary);
      const reference = text(formData, "reference");

      return draft(
        { zoneId: selection?.zoneId, cityId: selection?.cityId },
        reference === undefined ? {} : { reference },
      );
    }

    case "precio":
      return {
        ...draft({ priceUsd: count(formData, "priceUsd") }),
        raw: rawOf(formData, ["priceUsd"]),
      };

    case "tamano":
      return {
        ...draft({
          rooms: count(formData, "rooms"),
          bathrooms: count(formData, "bathrooms"),
          areaM2: count(formData, "areaM2"),
          // El unico campo donde vacio ES una respuesta: un anexo sin puesto
          // es un aviso normal, y nadie deberia tener que escribir un cero
          // para publicarlo.
          parkingSpots: count(formData, "parkingSpots") ?? 0,
        }),
        raw: rawOf(formData, ["rooms", "bathrooms", "areaM2", "parkingSpots"]),
      };

    case "atributos":
      return draft(
        {
          hasPowerPlant: checked(formData, "hasPowerPlant"),
          hasRegularWater: checked(formData, "hasRegularWater"),
          isFurnished: checked(formData, "isFurnished"),
          hasSecurity: checked(formData, "hasSecurity"),
          hasAppliances: checked(formData, "hasAppliances"),
        },
        // Mandar el paso ES la respuesta, incluida "No tiene ninguna". Sin
        // esta marca, no marcar nada seria indistinguible de no haber pasado
        // por el paso, y el riel mostraria un ✓ que nadie puso.
        { featuresDeclared: true },
      );

    case "titulo":
      return draft({ title: text(formData, "title") });

    case "descripcion": {
      const value = formData.get("description");
      // Se recortan los bordes y nada mas: los saltos de linea de adentro son
      // de quien escribe, y aplastarlos reescribiria su aviso.
      const description = typeof value === "string" ? value.trim() : "";
      return draft({ description: description === "" ? undefined : description });
    }

    case "fotos":
      return { answers: { listing: {}, photos: readPhotos(formData) }, raw: {} };

    case "quien":
      return draft({
        publisherType: text(formData, "publisherType") as DraftListingValues["publisherType"],
        contactMethod: text(formData, "contactMethod") as DraftListingValues["contactMethod"],
        contactValue: text(formData, "contactValue"),
      });
  }
}
