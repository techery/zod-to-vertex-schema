# zod-to-vertex-schema

Convert [Zod](https://github.com/colinhacks/zod) schemas to [Vertex AI/Gemini](https://cloud.google.com/vertex-ai) compatible schemas. This library helps you define your Vertex AI/Gemini function parameters using Zod's powerful schema definition system.

Developed by [Serge Zenchenko](https://github.com/sergeyzenchenko) at [Techery](https://techery.io).

## Type Compatibility

| Zod Type | Vertex AI Schema Type | Notes |
|----------|---------------------|-------|
| `z.string()` | `STRING` | Basic string type |
| `z.string().datetime()` | `STRING` | With `format: "date-time"` |
| `z.string().date()` | `STRING` | With `format: "date"` |
| `z.number()` | `NUMBER` | Floating point numbers |
| `z.number().int()` | `INTEGER` | Integer numbers |
| `z.boolean()` | `BOOLEAN` | Boolean values |
| `z.enum([...])` | `STRING` | With `enum: [...]` |
| `z.object({...})` | `OBJECT` | With `properties`, `required`, and `propertyOrdering` matching Zod field order |
| `z.array(...)` | `ARRAY` | With `items` schema |
| `z.union([...])` | N/A | Converted to `anyOf: [...]` |
| `z.discriminatedUnion(...)` | N/A | Converted to `anyOf: [...]` |
| `z.literal(string)` | `STRING` | With `enum: [value]` |
| `z.null()` | `STRING` | With `nullable: true` |
| `someSchema.optional()` | Same as base | Field removed from `required` |
| `someSchema.nullable()` | Same as base | With `nullable: true` |
| `z.lazy(...)` | N/A | Not supported - Vertex AI schema doesn't support recursive definitions |

## Installation

```bash
npm install zod-to-vertex-schema
```

## Usage

### Basic Example

```typescript
import { z } from 'zod';
import { zodToVertexSchema } from 'zod-to-vertex-schema';

// Define your Zod schema
const userSchema = z.object({
  name: z.string(),
  age: z.number().int().min(0),
  email: z.string().email(),
  roles: z.array(z.enum(['admin', 'user'])),
});

// Convert to Vertex AI schema
const vertexSchema = zodToVertexSchema(userSchema);

// Resulting Vertex AI schema:
{
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    age: { type: "INTEGER", minimum: 0 },
    email: { type: "STRING" },
    roles: {
      type: "ARRAY",
      items: { type: "STRING", enum: ["admin", "user"] }
    }
  },
  required: ["name", "age", "email", "roles"],
  propertyOrdering: ["name", "age", "email", "roles"]
}
```

### Advanced Examples

#### Optional and Nullable Fields

```typescript
const profileSchema = z.object({
  username: z.string(),
  displayName: z.string().optional(), // Will be marked as not required
  bio: z.string().nullable(), // Will be marked as nullable
  lastSeen: z.date().optional().nullable(), // Both optional and nullable
});

const vertexProfileSchema = zodToVertexSchema(profileSchema);

// Resulting Vertex AI schema:
{
  type: "OBJECT",
  properties: {
    username: { type: "STRING" },
    displayName: { type: "STRING" },
    bio: { type: "STRING", nullable: true },
    lastSeen: { type: "STRING", format: "date", nullable: true }
  },
  required: ["username"],
  propertyOrdering: ["username", "displayName", "bio", "lastSeen"]
}
```

#### Complex Nested Objects

```typescript
const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string(),
  postalCode: z.string(),
});

const orderSchema = z.object({
  orderId: z.string(),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    addresses: z.array(addressSchema),
  }),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
    price: z.number().min(0),
  })),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered']),
  createdAt: z.date(),
});

const vertexOrderSchema = zodToVertexSchema(orderSchema);

// Resulting Vertex AI schema:
{
  type: "OBJECT",
  properties: {
    orderId: { type: "STRING" },
    customer: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        name: { type: "STRING" },
        addresses: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              street: { type: "STRING" },
              city: { type: "STRING" },
              country: { type: "STRING" },
              postalCode: { type: "STRING" }
            },
            required: ["street", "city", "country", "postalCode"],
            propertyOrdering: ["street", "city", "country", "postalCode"]
          }
        }
      },
      required: ["id", "name", "addresses"],
      propertyOrdering: ["id", "name", "addresses"]
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          productId: { type: "STRING" },
          quantity: { type: "INTEGER", minimum: 1 },
          price: { type: "NUMBER", minimum: 0 }
        },
        required: ["productId", "quantity", "price"],
        propertyOrdering: ["productId", "quantity", "price"]
      }
    },
    status: { type: "STRING", enum: ["pending", "processing", "shipped", "delivered"] },
    createdAt: { type: "STRING", format: "date" }
  },
  required: ["orderId", "customer", "items", "status", "createdAt"],
  propertyOrdering: ["orderId", "customer", "items", "status", "createdAt"]
}
```

#### Unions and Discriminated Unions

```typescript
// Simple union
const resultSchema = z.union([
  z.object({ success: z.literal(true), data: z.string() }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

// Discriminated union
const shapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('circle'), radius: z.number() }),
  z.object({ type: z.literal('rectangle'), width: z.number(), height: z.number() }),
]);

const vertexResultSchema = zodToVertexSchema(resultSchema);
const vertexShapeSchema = zodToVertexSchema(shapeSchema);

// Resulting Vertex AI schemas:
// For resultSchema:
{
  anyOf: [
    {
      type: "OBJECT",
      properties: {
        success: { type: "STRING", enum: ["true"] },
        data: { type: "STRING" }
      },
      required: ["success", "data"],
      propertyOrdering: ["success", "data"]
    },
    {
      type: "OBJECT",
      properties: {
        success: { type: "STRING", enum: ["false"] },
        error: { type: "STRING" }
      },
      required: ["success", "error"],
      propertyOrdering: ["success", "error"]
    }
  ]
}

// For shapeSchema:
{
  anyOf: [
    {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", enum: ["circle"] },
        radius: { type: "NUMBER" }
      },
      required: ["type", "radius"],
      propertyOrdering: ["type", "radius"]
    },
    {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", enum: ["rectangle"] },
        width: { type: "NUMBER" },
        height: { type: "NUMBER" }
      },
      required: ["type", "width", "height"],
      propertyOrdering: ["type", "width", "height"]
    }
  ]
}
```

#### Date and Format Validation

```typescript
const eventSchema = z.object({
  title: z.string(),
  startDate: z.date(), // Will be converted to date format
  endDate: z.date(),
  createdAt: z.string().datetime(), // Will be converted to date-time format
});

const vertexEventSchema = zodToVertexSchema(eventSchema);

// Resulting Vertex AI schema:
{
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    startDate: { type: "STRING", format: "date" },
    endDate: { type: "STRING", format: "date" },
    createdAt: { type: "STRING", format: "date-time" }
  },
  required: ["title", "startDate", "endDate", "createdAt"],
  propertyOrdering: ["title", "startDate", "endDate", "createdAt"]
}
```

## Supported Features

- Basic Types:
  - `string`
  - `number` (with `int()` support)
  - `boolean`
  - `date`
  
- Complex Types:
  - Objects (`z.object()`)
  - Arrays (`z.array()`)
  - Enums (`z.enum()`)
  - Unions (`z.union()`)
  - Discriminated Unions (`z.discriminatedUnion()`)
  - Literals (`z.literal()`) for strings

- Modifiers:
  - Optional fields (`optional()`)
  - Nullable fields (`nullable()`)
  - String formats (`date()`, `datetime()`)
  - Number constraints (`min()`, `max()`)

- Metadata:
  - Description preservation
  - Property ordering in objects (preserves the exact order of fields as defined in your Zod schema)

## API Reference

### `zodToVertexSchema(schema: z.ZodTypeAny): VertexSchema`

Converts any Zod schema into a Vertex AI/Gemini-compatible schema.

### `zodDynamicEnum(values: string[]): z.ZodEnum`

Helper function to create an enum schema from a dynamic array of strings.

```typescript
const roles = ['admin', 'user', 'guest'];
const roleSchema = zodDynamicEnum(roles);
```

## Notes

- Default values are intentionally ignored in the conversion process
- Recursive schemas (using `z.lazy()`) are not supported because Vertex AI schema format doesn't support schema definitions or recursive references
- Some Zod features like transformers, refinements, and custom validators are not supported
- Non-string literals are not supported in the current version

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Authors

- [Serge Zenchenko](https://github.com/sergez) - Principal Engineer at [Techery](https://techery.io)

## License

MIT © [Serge Zenchenko](https://github.com/sergez) / [Techery](https://techery.io) 