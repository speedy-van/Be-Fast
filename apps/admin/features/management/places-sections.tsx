"use client";

import {
  citySchema,
  foodCategorySchema,
  governorateSchema,
  neighborhoodSchema,
  foodCategoryCreateSchema,
  foodCategoryUpdateSchema,
} from "@be-fast/contracts";
import { adminManagement as text, adminShellText } from "@be-fast/i18n";
import { useState } from "react";
import { z } from "zod";
import { adminRequest } from "../../lib/client";
import { useAdminResource } from "../../lib/use-admin-resource";
import { CommandForm, ResourceMessage, value } from "./shared";

const common = text.common;
const governoratesSchema = governorateSchema.array();
const citiesSchema = citySchema.array();
const neighborhoodsSchema = neighborhoodSchema.array();
const categoriesSchema = foodCategorySchema.array();
const validName = z.string().trim().min(1).max(120);

interface Place {
  id: string;
  name: string;
  isActive: boolean;
}

function PlaceEditor({
  title,
  endpoint,
  places,
  onSaved,
  parent,
  selected,
  onSelect,
}: {
  title: string;
  endpoint: string;
  places: Place[];
  onSaved: () => void;
  parent?: { governorateId: string } | { cityId: string };
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string>();
  return (
    <section className="panel">
      <h2>{title}</h2>
      {places.length === 0 && <p>{adminShellText.empty}</p>}
      {places.map((place) => (
        <article key={place.id} className="stack">
          <div className="actions">
            {onSelect ? (
              <button
                aria-pressed={selected === place.id}
                onClick={() => onSelect(place.id)}
              >
                {place.name}
              </button>
            ) : (
              <strong>{place.name}</strong>
            )}
            <span>{place.isActive ? common.active : common.inactive}</span>
            <button
              aria-expanded={editing === place.id}
              onClick={() =>
                setEditing((current) =>
                  current === place.id ? undefined : place.id,
                )
              }
            >
              {common.edit}
            </button>
          </div>
          {editing === place.id && (
            <>
              <CommandForm
                key={`${place.name}-${place.isActive}`}
                label={common.save}
                validate={(form) =>
                  validName.safeParse(value(form, "name")).success
                }
                onCommit={async (form) => {
                  const body = {
                    name: value(form, "name"),
                    isActive: form.has("active"),
                  };
                  await adminRequest(`${endpoint}/${place.id}`, {
                    method: "PATCH",
                    body,
                  });
                  onSaved();
                }}
              >
                <label>
                  {common.name}
                  <input
                    name="name"
                    defaultValue={place.name}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="check-input">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={place.isActive}
                  />
                  {common.active}
                </label>
              </CommandForm>
              <CommandForm
                label={common.remove}
                onCommit={async () => {
                  await adminRequest(`${endpoint}/${place.id}`, {
                    method: "DELETE",
                  });
                  onSaved();
                }}
              />
            </>
          )}
        </article>
      ))}
      <CommandForm
        label={common.add}
        validate={(form) => validName.safeParse(value(form, "name")).success}
        onCommit={async (form) => {
          await adminRequest(endpoint, {
            method: "POST",
            body: { ...parent, name: value(form, "name") },
          });
          onSaved();
        }}
      >
        <label>
          {common.name}
          <input name="name" maxLength={120} required />
        </label>
      </CommandForm>
    </section>
  );
}

export function RegionsSection() {
  const [governorateId, setGovernorate] = useState<string>();
  const [cityId, setCity] = useState<string>();
  const governorates = useAdminResource(
    "/admin/governorates",
    governoratesSchema,
  );
  const cities = useAdminResource(
    governorateId
      ? `/admin/cities?${new URLSearchParams({ governorateId })}`
      : null,
    citiesSchema,
  );
  const neighborhoods = useAdminResource(
    cityId ? `/admin/neighborhoods?${new URLSearchParams({ cityId })}` : null,
    neighborhoodsSchema,
  );
  const place = text.places;

  return (
    <div className="card-grid">
      <div className="stack">
        <ResourceMessage resource={governorates} />
        {governorates.data && (
          <PlaceEditor
            title={place.governorates}
            endpoint="/admin/governorates"
            places={governorates.data}
            selected={governorateId}
            onSelect={(id) => {
              setGovernorate(id);
              setCity(undefined);
            }}
            onSaved={() => {
              setGovernorate(undefined);
              setCity(undefined);
              governorates.refresh();
            }}
          />
        )}
      </div>
      <div className="stack">
        <ResourceMessage resource={cities} />
        {governorateId && cities.data && (
          <PlaceEditor
            key={governorateId}
            title={place.cities}
            endpoint="/admin/cities"
            places={cities.data}
            selected={cityId}
            parent={{ governorateId }}
            onSelect={setCity}
            onSaved={() => {
              setCity(undefined);
              cities.refresh();
            }}
          />
        )}
      </div>
      <div className="stack">
        <ResourceMessage resource={neighborhoods} />
        {cityId && neighborhoods.data && (
          <PlaceEditor
            key={cityId}
            title={place.neighborhoods}
            endpoint="/admin/neighborhoods"
            places={neighborhoods.data}
            parent={{ cityId }}
            onSaved={neighborhoods.refresh}
          />
        )}
      </div>
    </div>
  );
}

const categoryPath = "/admin/categories";
type Category = z.infer<typeof foodCategorySchema>;

function categoryPayload(form: FormData) {
  return {
    name: value(form, "name"),
    icon: value(form, "icon") || null,
    sortOrder: Number(value(form, "sortOrder") || NaN),
    isActive: form.has("isActive"),
  };
}

function CategoryForm({
  category,
  onSaved,
}: {
  category?: Category;
  onSaved: () => void;
}) {
  return (
    <CommandForm
      label={category ? common.save : common.add}
      validate={(form) =>
        (category
          ? foodCategoryUpdateSchema
          : foodCategoryCreateSchema
        ).safeParse(categoryPayload(form)).success
      }
      onCommit={async (form) => {
        await adminRequest(
          category ? `${categoryPath}/${category.id}` : categoryPath,
          { method: category ? "PATCH" : "POST", body: categoryPayload(form) },
        );
        onSaved();
      }}
    >
      <label>
        {common.name}
        <input
          name="name"
          maxLength={120}
          required
          defaultValue={category?.name}
        />
      </label>
      <label>
        {text.places.icon}
        <input
          name="icon"
          maxLength={160}
          defaultValue={category?.icon ?? ""}
        />
      </label>
      <label>
        {text.places.position}
        <input
          name="sortOrder"
          type="number"
          min="0"
          step="1"
          defaultValue={category?.sortOrder ?? 0}
          required
        />
      </label>
      <label className="check-input">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={category?.isActive ?? true}
        />
        {common.active}
      </label>
    </CommandForm>
  );
}

export function CategoriesSection() {
  const categories = useAdminResource(categoryPath, categoriesSchema);
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <ResourceMessage resource={categories} />
      <section className="panel">
        <CategoryForm onSaved={categories.refresh} />
      </section>
      {categories.data?.length === 0 && <p>{adminShellText.empty}</p>}
      {categories.data?.map((category) => (
        <article className="stack" key={category.id}>
          <h2>{category.name}</h2>
          <p>
            {category.isActive ? common.active : common.inactive} ·{" "}
            {category.sortOrder}
          </p>
          <button
            aria-expanded={selected === category.id}
            onClick={() =>
              setSelected((current) =>
                current === category.id ? undefined : category.id,
              )
            }
          >
            {text.places.editCategory}
          </button>
          {selected === category.id && (
            <>
              <CategoryForm
                key={JSON.stringify(category)}
                category={category}
                onSaved={categories.refresh}
              />
              <CommandForm
                label={common.remove}
                onCommit={async () => {
                  await adminRequest(`${categoryPath}/${category.id}`, {
                    method: "DELETE",
                  });
                  categories.refresh();
                }}
              />
            </>
          )}
        </article>
      ))}
    </>
  );
}
