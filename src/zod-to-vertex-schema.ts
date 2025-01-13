import { z } from 'zod';
import { SchemaType, VertexSchema } from './vertex-schema';

export function zodDynamicEnum(values: string[]) {
  return z.enum(values as [string, ...string[]]);
}

/**
 * Main function to convert any Zod schema into a Gemini-compatible VertexSchema.
 * Defaults are intentionally ignored (not included in final schema).
 */
export function zodToVertexSchema(schema: z.ZodTypeAny): VertexSchema {
  const isZodNull = schema instanceof z.ZodNull;

  // 1) If schema is optional or nullable, unwrap it and mark "nullable" if appropriate.
  if (!isZodNull && (schema.isOptional() || schema.isNullable())) {
    const baseSchema = unwrapOptionalOrNullable(schema);
    const geminiInner = zodToVertexSchema(baseSchema);

    // If the Zod schema is nullable, reflect that in the Gemini schema
    if (schema.isNullable()) {
      geminiInner.nullable = true;
    }

    // Carry over the description if present
    if (schema.description) {
      geminiInner.description = schema.description;
    }

    return geminiInner;
  }

  // 2) Dispatch based on known Zod constructors
  if (schema instanceof z.ZodString) {
    return makeStringSchema(schema);
  }

  if (schema instanceof z.ZodNumber) {
    return makeNumberSchema(schema);
  }

  if (schema instanceof z.ZodBoolean) {
    return {
      type: SchemaType.BOOLEAN,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodObject) {
    return makeObjectSchema(schema);
  }

  if (schema instanceof z.ZodArray) {
    return makeArraySchema(schema);
  }

  if (schema instanceof z.ZodEnum) {
    return makeEnumSchema(schema);
  }

  if (schema instanceof z.ZodUnion) {
    return makeUnionSchema(schema);
  }

  if (schema instanceof z.ZodLiteral) {
    return makeLiteralSchema(schema);
  }

  if (schema instanceof z.ZodNull) {
    // No native "null" type in Gemini. Use type=STRING + nullable=true as a fallback.
    return {
      type: SchemaType.STRING,
      nullable: true,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodDiscriminatedUnion) {
    return makeDiscriminatedUnionSchema(schema);
  }

  throw new Error(`Unsupported Zod type: ${schema.constructor.name}`);
}

/**
 * If a schema is optional/null/default, unwrap to the "inner" schema.
 * This way we can apply the relevant checks to the base type.
 */
function unwrapOptionalOrNullable(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodNull) {
    throw new Error('ZodNull is not supported');
  }

  // Zod chain can store underlying schema in ._def.innerType or ._def.schema.
  if (schema._def?.innerType) {
    return schema._def.innerType;
  }
  if (schema._def?.schema) {
    return schema._def.schema;
  }
  return schema;
}

/**
 * Convert a ZodString into a Gemini schema:
 *  - format
 *  - (Ignores any default value)
 */
function makeStringSchema(schema: z.ZodString): VertexSchema {
  const gemini: VertexSchema = {
    type: SchemaType.STRING,
    description: schema.description,
  };

  // Iterate over each check in the ZodString's definition.
  const checks = schema._def.checks || [];
  for (const check of checks) {
    switch (check.kind) {
      case 'datetime':
        gemini.format = 'date-time';
        break;
      case 'date':
        gemini.format = 'date';
        break;
      default:
        throw new Error(`Unsupported string check: ${check.kind}`);
    }
  }

  return gemini;
}

/**
 * Convert z.number() to a Gemini schema:
 *  - type=NUMBER or INTEGER
 *  - min => minimum, max => maximum
 *  - Ignores default values
 *  - Includes description
 */
function makeNumberSchema(schema: z.ZodNumber): VertexSchema {
  const gemini: VertexSchema = {
    description: schema.description,
  };

  const checks = schema._def.checks || [];
  const isInt = checks.some((c: any) => c.kind === 'int');
  gemini.type = isInt ? SchemaType.INTEGER : SchemaType.NUMBER;

  for (const check of checks) {
    if (check.kind === 'min') {
      gemini.minimum = check.value;
    } else if (check.kind === 'max') {
      gemini.maximum = check.value;
    }
  }

  return gemini;
}

/**
 * Convert z.object(...) to a Gemini schema:
 *  - type=OBJECT
 *  - properties => recursively derived from each field
 *  - required => array of non-optional field names
 *  - propertyOrdering => preserve the field order
 *  - Ignores default
 *  - Includes description
 */
function makeObjectSchema(schema: z.ZodObject<any>): VertexSchema {
  const shape = schema._def.shape();
  const propertyKeys = Object.keys(shape);

  const properties: Record<string, VertexSchema> = {};
  const required: string[] = [];
  const propertyOrdering: string[] = [];

  for (const key of propertyKeys) {
    const fieldSchema = shape[key];
    propertyOrdering.push(key);

    if (!fieldSchema.isOptional()) {
      required.push(key);
    }

    // Recursively convert each field to a Gemini schema
    properties[key] = zodToVertexSchema(fieldSchema);
  }

  const gemini: VertexSchema = {
    type: SchemaType.OBJECT,
    properties,
    propertyOrdering,
    description: schema.description,
  };

  if (required.length > 0) {
    gemini.required = required;
  }

  return gemini;
}

/**
 * Convert z.array(T) => type=ARRAY with "items" as T's schema,
 * and minItems / maxItems / exactLength if specified.
 * (Ignores default, includes description.)
 */
function makeArraySchema(schema: z.ZodArray<any>): VertexSchema {
  const itemsGemini = zodToVertexSchema(schema.element);

  const gemini: VertexSchema = {
    type: SchemaType.ARRAY,
    items: itemsGemini,
    description: schema.description,
  };

  // For arrays, Zod uses ._def.minLength / ._def.maxLength / ._def.exactLength
  const { minLength, maxLength, exactLength } = schema._def;

  if (minLength?.value !== undefined) {
    gemini.minItems = minLength.value;
  }

  if (maxLength?.value !== undefined) {
    gemini.maxItems = maxLength.value;
  }

  if (exactLength?.value !== undefined) {
    gemini.minItems = exactLength.value;
    gemini.maxItems = exactLength.value;
  }

  return gemini;
}

/**
 * Convert z.enum([...]) => type=STRING + enum=[...].
 * Defaults are ignored. Description is included.
 */
function makeEnumSchema(schema: z.ZodEnum<any>): VertexSchema {
  return {
    type: SchemaType.STRING,
    enum: schema._def.values,
    description: schema.description,
  };
}

/**
 * Convert a non-discriminated z.union([...]) into anyOf: [ ... ].
 */
function makeUnionSchema(schema: z.ZodUnion<any>): VertexSchema {
  const variants = schema._def.options;
  return {
    anyOf: variants.map((variant: any) => zodToVertexSchema(variant)),
  };
}

/**
 * Convert z.literal(...) => type + enum with a single value.
 * (No default to consider, plus description.)
 */
function makeLiteralSchema(schema: z.ZodLiteral<any>): VertexSchema {
  const literalValue = schema._def.value;
  const valueType = typeof literalValue;

  const gemini: VertexSchema = {
    description: schema.description,
  };

  // We only handle "string" in detail here, fallback for other literal types
  // as type=STRING with that single enum value as a string
  if (valueType === 'string') {
    gemini.type = SchemaType.STRING;
    gemini.enum = [literalValue];
  } else {
    throw new Error(`Unsupported literal type. Gemini doesn't support ${valueType} literals.`);
  }

  return gemini;
}

/**
 * Convert a discriminated union => anyOf for each branch.
 * Ignores default. No special "discriminator" field included.
 */
function makeDiscriminatedUnionSchema(schema: z.ZodDiscriminatedUnion<string, any>): VertexSchema {
  const { optionsMap } = schema._def;
  // Convert each variant in the union
  const anyOfSchemas = Array.from(optionsMap.values()).map((option) => zodToVertexSchema(option));

  return {
    anyOf: anyOfSchemas,
  };
}
