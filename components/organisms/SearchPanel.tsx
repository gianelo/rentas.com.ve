import type {
  AttributeChoice,
  CityChoice,
  HiddenField,
  RoomChoice,
  SearchPanelModel,
  ZoneChoice,
} from "@/modules/listing-search/domain/search-panel";
import styles from "./SearchPanel.module.css";

/**
 * **El acordeón de cuatro pasos** — ciudad, zona, precio, habitaciones — y la
 * misma pieza dibujada como barra lateral en escritorio.
 *
 * Reemplaza a `components/molecules/SearchFilters.tsx`, que es del diseño
 * anterior (cita los artboards `2a`–`2e`) y se veía dentro de una pantalla
 * nueva.
 *
 * **Este componente no decide nada.** Recibe un `SearchPanelModel` ya armado
 * por `listing-search/domain/search-panel.ts`: cada opción llega con su
 * etiqueta, su conteo, si está elegida, si está deshabilitada y a qué
 * dirección lleva. La regla permanente del fundador es la razón —«nunca más
 * coloques una regla de negocio en el front»— y hay una mecánica encima: el
 * suelo de cobertura del 90 % llega a `domain/` y no llega a `components/`, así
 * que una regla escrita acá sería una regla que ninguna corrida de tests puede
 * poner en rojo.
 *
 * **Sin JavaScript, y sin `"use client"`** (F14). Tres mecanismos nativos
 * hacen todo el trabajo:
 *
 * 1. `<details>` abre y cierra. El atributo `name` compartido es el acordeón
 *    exclusivo del navegador: abrir uno cierra los otros, sin una línea de
 *    guion.
 * 2. Cada opción de una lista es un **enlace**: tocarla recarga con la
 *    búsqueda nueva en la dirección, y el servidor vuelve a contar. Por eso el
 *    número del botón es real en cada paso sin nada corriendo en el cliente.
 * 3. Precio y buscador de zonas son **formularios `GET`**, porque son texto
 *    libre y no una lista de opciones. Se llevan el resto del estado en campos
 *    escondidos para no perderlo al enviar.
 *
 * Una opción deshabilitada se dibuja como `<span aria-disabled="true">` y no
 * como un enlace: no existe un enlace apagado, y dejarlo enlazado mandaría a
 * una pantalla vacía — lo que la regla transversal 4 prohíbe.
 */
export function SearchPanel({ model }: { readonly model: SearchPanelModel }) {
  return (
    <section className={styles.panel} aria-label="Filtros de búsqueda" data-testid="search-panel">
      {model.steps.map((step) => (
        <details
          key={step.id}
          className={styles.step}
          open={step.open}
          // El acordeón exclusivo del navegador. En un navegador que todavía no
          // lo entienda, el peor caso es que queden dos secciones abiertas —
          // molesto, nunca roto.
          name="paso-de-busqueda"
        >
          <summary className={styles.summary}>
            <span className={styles.position}>{step.position}</span>
            <span className={styles.stepTitle}>{step.title}</span>
            <span className={styles.stepValue}>{step.summary}</span>
          </summary>

          <div className={styles.body}>
            <p className={styles.question}>{step.question}</p>

            {step.id === "ciudad" ? <CityStep cities={model.cities} /> : null}
            {step.id === "zona" ? <ZoneStep model={model} /> : null}
            {step.id === "precio" ? <PriceStep model={model} /> : null}
            {step.id === "habitaciones" ? <RoomsStep model={model} /> : null}
          </div>
        </details>
      ))}

      <div className={styles.foot}>
        {/* «Limpiar todo» vuelve al valor por defecto TODO menos la ciudad
            (F8). La dirección ya la calculó el dominio; acá es un enlace
            porque es una dirección, y tiene que poder abrirse y pegarse. */}
        <a className={styles.clear} href={model.clearAllHref}>
          Limpiar todo
        </a>

        {model.confirm.kind === "empty" ? (
          <div className={styles.empty}>
            {/* No se deshabilita nada: un botón apagado no explica por qué. */}
            <p className={styles.emptyLabel}>{model.confirm.label}</p>
            {model.confirm.relief === null ? null : (
              <a className={styles.confirm} href={model.confirm.relief.href}>
                {model.confirm.relief.label}
              </a>
            )}
          </div>
        ) : (
          <a className={styles.confirm} href={model.confirm.href} data-testid="search-confirm">
            {model.confirm.label}
          </a>
        )}
      </div>
    </section>
  );
}

function CityStep({ cities }: { readonly cities: readonly CityChoice[] }) {
  return (
    <>
      <ul className={styles.options}>
        {cities.map((city) => (
          <li key={city.id}>
            <a
              className={styles.option}
              href={city.href}
              aria-current={city.chosen ? "true" : undefined}
              data-chosen={city.chosen ? "" : undefined}
            >
              <span className={styles.optionName}>{city.name}</span>
              <span className={styles.count}>{city.count}</span>
            </a>
            {/* **Se avisa ANTES de tocar** (F3): cambiar de ciudad borra las
                zonas, y perder dos elecciones en silencio es lo que hace
                desconfiar de un filtro. */}
            {city.warning === null ? null : <p className={styles.warning}>{city.warning}</p>}
          </li>
        ))}
      </ul>
      <p className={styles.note}>Se busca en una ciudad a la vez.</p>
    </>
  );
}

function ZoneStep({ model }: { readonly model: SearchPanelModel }) {
  return (
    <>
      {/* El buscador **sólo autocompleta zonas conocidas** (F4): manda su texto
          contra un vocabulario cerrado y lo que vuelve son zonas de esta
          ciudad. Nunca busca en títulos ni acepta texto libre como filtro. */}
      <form className={styles.search} method="get" action={model.zoneSearch.action}>
        <Hidden fields={model.zoneSearch.hidden} />
        <label className={styles.searchLabel} htmlFor="buscar-zona">
          Buscar una zona
        </label>
        <div className={styles.searchRow}>
          <input
            className={styles.control}
            id="buscar-zona"
            type="search"
            name={model.zoneSearch.name}
            defaultValue={model.zoneSearch.value}
            placeholder="Chacao, Bella Vista…"
          />
          <button className={styles.searchAction} type="submit">
            Buscar
          </button>
        </div>
      </form>

      {model.zoneSearch.noMatches ? (
        <p className={styles.note}>
          Ninguna zona de esta ciudad se llama así. Probá con otro nombre.
        </p>
      ) : (
        <ul className={styles.options}>
          {model.zones.map((zone) => (
            <ZoneOptionItem key={zone.id} zone={zone} />
          ))}
        </ul>
      )}
    </>
  );
}

function ZoneOptionItem({ zone }: { readonly zone: ZoneChoice }) {
  const body = (
    <>
      <span className={styles.optionName}>
        {/* El «✓» es la marca de la lámina y va DENTRO del texto, no como
            color: el estado tiene que sobrevivir a la escala de grises. */}
        {zone.chosen ? "✓ " : ""}
        {zone.name}
      </span>
      {zone.countLabel === null ? null : <span className={styles.count}>{zone.countLabel}</span>}
    </>
  );

  return (
    <li>
      {zone.disabled ? (
        <span className={styles.option} aria-disabled="true">
          {body}
        </span>
      ) : (
        <a
          className={styles.option}
          href={zone.href}
          aria-pressed={zone.chosen ? "true" : undefined}
          data-chosen={zone.chosen ? "" : undefined}
        >
          {body}
        </a>
      )}
    </li>
  );
}

function PriceStep({ model }: { readonly model: SearchPanelModel }) {
  return (
    // Los dos extremos son opcionales, y al revés se intercambian en vez de dar
    // error (F5). El intercambio lo hace `buildSearchCriteria`, así que estos
    // campos ya vuelven en orden después de enviar.
    <form className={styles.price} method="get" action={model.price.action}>
      <Hidden fields={model.price.hidden} />
      <div className={styles.priceRow}>
        <label className={styles.priceField} htmlFor="precio-desde">
          <span className={styles.searchLabel}>Desde</span>
          <input
            className={styles.control}
            id="precio-desde"
            type="number"
            inputMode="numeric"
            min={0}
            name={model.price.minName}
            defaultValue={model.price.min}
            placeholder="$200"
          />
        </label>
        <label className={styles.priceField} htmlFor="precio-hasta">
          <span className={styles.searchLabel}>Hasta</span>
          <input
            className={styles.control}
            id="precio-hasta"
            type="number"
            inputMode="numeric"
            min={0}
            name={model.price.maxName}
            defaultValue={model.price.max}
            placeholder="$1000"
          />
        </label>
      </div>
      <button className={styles.searchAction} type="submit">
        Usar este precio
      </button>
    </form>
  );
}

function RoomsStep({ model }: { readonly model: SearchPanelModel }) {
  return (
    <>
      <ul className={styles.steps}>
        {model.rooms.map((room) => (
          <RoomOptionItem key={room.step} room={room} />
        ))}
      </ul>

      <ul className={styles.options}>
        <li>
          <a
            className={styles.option}
            href={model.publisher.href}
            data-chosen={model.publisher.chosen ? "" : undefined}
          >
            <span className={styles.optionName}>
              {model.publisher.chosen ? "✓ " : ""}
              {model.publisher.label}
              <span className={styles.note}>{model.publisher.note}</span>
            </span>
            <span className={styles.count}>{model.publisher.count}</span>
          </a>
        </li>
        {model.attributes.map((attribute) => (
          <AttributeOptionItem key={attribute.attribute} attribute={attribute} />
        ))}
      </ul>
    </>
  );
}

function RoomOptionItem({ room }: { readonly room: RoomChoice }) {
  const body = (
    <>
      <span className={styles.stepNumber}>{room.label}</span>
      <span className={styles.count}>{room.count}</span>
    </>
  );

  return (
    <li>
      {room.disabled ? (
        <span className={styles.roomOption} aria-disabled="true">
          {body}
        </span>
      ) : (
        <a
          className={styles.roomOption}
          href={room.href}
          aria-pressed={room.chosen ? "true" : undefined}
          data-chosen={room.chosen ? "" : undefined}
        >
          {body}
        </a>
      )}
    </li>
  );
}

function AttributeOptionItem({ attribute }: { readonly attribute: AttributeChoice }) {
  const body = (
    <>
      <span className={styles.optionName}>
        {attribute.chosen ? "✓ " : ""}
        {attribute.label}
      </span>
      {/* «9 de 16», y el cero SÍ se escribe: es la respuesta a «¿por qué no
          puedo tocar esto?» (F6). */}
      <span className={styles.count}>{attribute.note}</span>
    </>
  );

  return (
    <li>
      {attribute.disabled ? (
        <span className={styles.option} aria-disabled="true">
          {body}
        </span>
      ) : (
        <a
          className={styles.option}
          href={attribute.href}
          aria-pressed={attribute.chosen ? "true" : undefined}
          data-chosen={attribute.chosen ? "" : undefined}
        >
          {body}
        </a>
      )}
    </li>
  );
}

/**
 * El resto de la búsqueda, escondida dentro del formulario.
 *
 * Un `<form method="get">` reemplaza la query entera por sus propios campos:
 * sin esto, enviar el precio borraría las zonas y las habitaciones que ya
 * estaban puestas. Qué campos son lo decide el dominio.
 */
function Hidden({ fields }: { readonly fields: readonly HiddenField[] }) {
  return (
    <>
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
    </>
  );
}
