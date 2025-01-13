// zod-to-vertex-schema.spec.ts
import { z } from 'zod';
import { zodDynamicEnum, zodToVertexSchema } from './zod-to-vertex-schema';
import { SchemaType } from './vertex-schema';

describe('zodDynamicEnum', () => {
  it('should create a valid zod enum with provided string array', () => {
    const result = zodDynamicEnum(['APPLE', 'BANANA', 'CHERRY']);
    expect(result.options).toEqual(['APPLE', 'BANANA', 'CHERRY']);
    // Validate usage:
    expect(result.safeParse('APPLE').success).toBe(true);
    expect(result.safeParse('BANANA').success).toBe(true);
    expect(result.safeParse('GRAPE').success).toBe(false);
  });
});

describe('zodToVertexSchema', () => {
  describe('common behaviors', () => {
    it('throws error for unsupported Zod type', () => {
      // e.g. ZodBigInt is not covered by any if statements
      const schema = z.bigint();
      expect(() => zodToVertexSchema(schema)).toThrowError(/Unsupported Zod type: ZodBigInt/i);
    });

    it('carries over description when present', () => {
      const schema = z.string().describe('A simple string');
      const result = zodToVertexSchema(schema);
      expect(result.description).toBe('A simple string');
    });
  });

  describe('optional / nullable handling', () => {
    it('unwraps optional schema but does not set `nullable`', () => {
      const schema = z.string().optional().describe('optional str');
      const result = zodToVertexSchema(schema);
      // Should become a string schema without "nullable" or "required" constraints
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.nullable).toBeUndefined();
      expect(result.description).toBe('optional str');
    });

    it('unwraps nullable schema and sets `nullable` to true', () => {
      const schema = z.string().nullable().describe('nullable str');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.nullable).toBe(true);
      expect(result.description).toBe('nullable str');
    });

    it('unwraps optional + nullable schema and sets `nullable`', () => {
      const schema = z.string().nullable().optional().describe('opt/null str');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.nullable).toBe(true);
    });
  });

  describe('ZodString', () => {
    it('returns string schema with no format if no checks used', () => {
      const schema = z.string().describe('A plain string');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.format).toBeUndefined();
      expect(result.description).toBe('A plain string');
    });

    it('recognizes date-time check', () => {
      const schema = z.string().datetime().describe('datetime string');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.format).toBe('date-time');
    });

    it('recognizes date check', () => {
      // As of Zod v3.22.2, there's a .date() check in z.string()
      const schema = z.string().date().describe('date string');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.format).toBe('date');
    });

    it('throws error if unknown check is encountered', () => {
      // We'll simulate a check with `kind` that doesn't exist
      const customCheckSchema = (z.string() as any)._addCheck({ kind: 'regex' });
      expect(() => zodToVertexSchema(customCheckSchema)).toThrowError(
        /Unsupported string check: regex/
      );
    });
  });

  describe('ZodNumber', () => {
    it('returns number schema', () => {
      const schema = z.number().describe('some number');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.NUMBER);
      expect(result.description).toBe('some number');
      expect(result.minimum).toBeUndefined();
      expect(result.maximum).toBeUndefined();
    });

    it('sets type=INTEGER if .int() check is found', () => {
      const schema = z.number().int().describe('some integer');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.INTEGER);
    });

    it('recognizes min and max checks', () => {
      const schema = z.number().min(10).max(20).describe('bounded number');
      const result = zodToVertexSchema(schema);
      expect(result.minimum).toBe(10);
      expect(result.maximum).toBe(20);
    });
  });

  describe('ZodBoolean', () => {
    it('returns boolean schema', () => {
      const schema = z.boolean().describe('boolean field');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.BOOLEAN);
      expect(result.description).toBe('boolean field');
    });
  });

  describe('ZodObject', () => {
    it('returns object schema with properties, required, propertyOrdering', () => {
      const schema = z
        .object({
          id: z.string(),
          count: z.number().optional(),
          createdAt: z.string().datetime(),
        })
        .describe('An object schema');

      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.OBJECT);
      expect(result.description).toBe('An object schema');
      expect(result.properties).toBeDefined();

      // property order
      expect(result.propertyOrdering).toEqual(['id', 'count', 'createdAt']);

      // required only includes "id" and "createdAt"
      expect(result.required).toEqual(['id', 'createdAt']);

      // Check each property
      const { id, count, createdAt } = result.properties!;
      expect(id.type).toBe(SchemaType.STRING);
      expect(createdAt.type).toBe(SchemaType.STRING);
      expect(createdAt.format).toBe('date-time');
      // "count" is optional, so it also becomes type NUMBER but not required
      expect(count.type).toBe(SchemaType.NUMBER);
    });
  });

  describe('ZodArray', () => {
    it('returns array schema with items, minItems, maxItems, etc.', () => {
      const schema = z.array(z.string()).min(1).max(5).describe('array field');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.ARRAY);
      expect(result.items?.type).toBe(SchemaType.STRING);
      expect(result.minItems).toBe(1);
      expect(result.maxItems).toBe(5);
      expect(result.description).toBe('array field');
    });

    it('handles exactLength property', () => {
      // Zod: .length(n) sets the exactLength internally
      const schema = z.array(z.string()).length(3);
      const result = zodToVertexSchema(schema);
      expect(result.minItems).toBe(3);
      expect(result.maxItems).toBe(3);
    });
  });

  describe('ZodEnum', () => {
    it('returns string type plus enum values', () => {
      const schema = z.enum(['RED', 'GREEN', 'BLUE']).describe('color enum');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.enum).toEqual(['RED', 'GREEN', 'BLUE']);
      expect(result.description).toBe('color enum');
    });
  });

  describe('ZodUnion (non-discriminated)', () => {
    it('returns anyOf array for each variant', () => {
      const schema = z.union([z.string(), z.number(), z.boolean()]);
      const result = zodToVertexSchema(schema);
      expect(result.anyOf).toHaveLength(3);
      const [strVariant, numVariant, boolVariant] = result.anyOf!;
      expect(strVariant.type).toBe(SchemaType.STRING);
      expect(numVariant.type).toBe(SchemaType.NUMBER);
      expect(boolVariant.type).toBe(SchemaType.BOOLEAN);
    });
  });

  describe('ZodLiteral', () => {
    it('handles string literal properly', () => {
      const schema = z.literal('HELLO').describe('a literal string');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.enum).toEqual(['HELLO']);
      expect(result.description).toBe('a literal string');
    });

    it('throws error for non-string literal (number, boolean, etc.)', () => {
      const schema = z.literal(123);
      expect(() => zodToVertexSchema(schema)).toThrowError(
        /Unsupported literal type. Gemini doesn't support number literals./
      );
    });
  });

  describe('ZodNull', () => {
    it('returns null schema', () => {
      const schema = z.null().describe('a null schema');
      const result = zodToVertexSchema(schema);
      expect(result.type).toBe(SchemaType.STRING);
      expect(result.nullable).toBe(true);
      expect(result.description).toBe('a null schema');
    });
  });

  describe('ZodDiscriminatedUnion', () => {
    it('returns anyOf for each branch', () => {
      const shapeA = z.object({ type: z.literal('A'), value: z.number() });
      const shapeB = z.object({ type: z.literal('B'), name: z.string() });
      const schema = z.discriminatedUnion('type', [shapeA, shapeB]);

      const result = zodToVertexSchema(schema);
      expect(result.anyOf).toHaveLength(2);

      const [branchA, branchB] = result.anyOf!;
      expect(branchA.type).toBe(SchemaType.OBJECT);
      expect(branchB.type).toBe(SchemaType.OBJECT);
    });
  });
});
