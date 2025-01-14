import { z } from 'zod';
import { SchemaType, VertexSchema } from './vertex-schema';

export function vertexSchemaToZod(schema: VertexSchema): z.ZodTypeAny {
  // 1) If `anyOf` is present, treat it as a union of possibilities.
  if (schema.anyOf && schema.anyOf.length > 0) {
    const unionVariants = schema.anyOf.map((sub) => vertexSchemaToZod(sub));
    // Attach description or other metadata on the union if needed
    let unionSchema = z.union(
      unionVariants as unknown as readonly [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    );
    if (schema.description) {
      unionSchema = unionSchema.describe(schema.description);
    }
    return applyNullable(unionSchema, schema);
  }

  // 2) Otherwise, dispatch on the schema.type
  switch (schema.type) {
    case SchemaType.STRING:
      return makeStringZod(schema);

    case SchemaType.NUMBER:
    case SchemaType.INTEGER:
      return makeNumberZod(schema);

    case SchemaType.BOOLEAN:
      return makeBooleanZod(schema);

    case SchemaType.ARRAY:
      return makeArrayZod(schema);

    case SchemaType.OBJECT:
      return makeObjectZod(schema);

    default:
      // If no type is given or it's an unknown type, fall back to an "unknown" Zod type.
      // Or you could throw an error, depending on your needs.
      throw new Error(`Unsupported or missing schema.type: ${schema.type}`);
  }
}

/**
 * STRING handling:
 * - If `enum` is present with more than one value, use z.enum.
 * - If `enum` is present with exactly one value, use z.literal.
 * - Otherwise plain z.string(), plus `.datetime()` if format==='date-time', etc.
 */
function makeStringZod(schema: VertexSchema): z.ZodTypeAny {
  const { format, description, enum: maybeEnum } = schema;

  if (maybeEnum && maybeEnum.length > 1) {
    // multiple enumerated string values => z.enum([...])
    let out = z.enum(maybeEnum as [string, ...string[]]);
    if (description) out = out.describe(description);
    return applyNullable(out, schema);
  } else if (maybeEnum && maybeEnum.length === 1) {
    // single enumerated value => z.literal(...)
    let out = z.literal(maybeEnum[0]);
    if (description) out = out.describe(description);
    return applyNullable(out, schema);
  }

  // Otherwise, a basic string
  let strZod = z.string();
  if (format === 'date-time') {
    // Zod v3 has `z.string().datetime()`
    strZod = strZod.datetime();
  }
  // If you want to handle `date` or other custom formats:
  // - you might do a refine, or skip it, depending on your needs

  if (description) {
    strZod = strZod.describe(description);
  }

  return applyNullable(strZod, schema);
}

/**
 * NUMBER or INTEGER handling:
 * - Use z.number(), plus .int() if type=INTEGER
 * - Apply .min(schema.minimum), .max(schema.maximum)
 */
function makeNumberZod(schema: VertexSchema): z.ZodTypeAny {
  let numZod = z.number();
  if (schema.type === SchemaType.INTEGER) {
    numZod = numZod.int();
  }

  if (typeof schema.minimum === 'number') {
    numZod = numZod.min(schema.minimum);
  }
  if (typeof schema.maximum === 'number') {
    numZod = numZod.max(schema.maximum);
  }

  if (schema.description) {
    numZod = numZod.describe(schema.description);
  }

  return applyNullable(numZod, schema);
}

/**
 * BOOLEAN handling:
 * - Just z.boolean(), with optional `.describe(...)`
 */
function makeBooleanZod(schema: VertexSchema): z.ZodTypeAny {
  let boolZod = z.boolean();
  if (schema.description) {
    boolZod = boolZod.describe(schema.description);
  }
  return applyNullable(boolZod, schema);
}

/**
 * ARRAY handling:
 * - Must have `items`
 * - Use z.array(itemsZod)
 * - Apply .min(schema.minItems), .max(schema.maxItems)
 */
function makeArrayZod(schema: VertexSchema): z.ZodTypeAny {
  if (!schema.items) {
    throw new Error(`ARRAY type schema must have 'items'`);
  }

  const elementZod = vertexSchemaToZod(schema.items);
  let arrZod = z.array(elementZod);

  if (typeof schema.minItems === 'number') {
    arrZod = arrZod.min(schema.minItems);
  }
  if (typeof schema.maxItems === 'number') {
    arrZod = arrZod.max(schema.maxItems);
  }

  if (schema.description) {
    arrZod = arrZod.describe(schema.description);
  }

  return applyNullable(arrZod, schema);
}

/**
 * OBJECT handling:
 * - Each key in `properties` => shape entry
 * - If key not in `required`, mark as .optional()
 */
function makeObjectZod(schema: VertexSchema): z.ZodTypeAny {
  const { properties = {}, required = [], description } = schema;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const key of Object.keys(properties)) {
    const propertySchema = properties[key];
    let zodField = vertexSchemaToZod(propertySchema);

    if (!required.includes(key)) {
      zodField = zodField.optional();
    }
    shape[key] = zodField;
  }

  let objectZod = z.object(shape);
  if (description) {
    objectZod = objectZod.describe(description);
  }

  return applyNullable(objectZod, schema);
}

/**
 * If schema.nullable = true, attach .nullable().
 * (This does NOT handle the difference between "nullable" vs. "optional";
 * typically you'll handle "optional" if the property is NOT in `required`.)
 */
function applyNullable<T extends z.ZodTypeAny>(zodSchema: T, schema: VertexSchema): T {
  if (schema.nullable) {
    return zodSchema.nullable() as unknown as T;
  }
  return zodSchema;
}
