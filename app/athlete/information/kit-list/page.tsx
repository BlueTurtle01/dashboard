import { userHasFeature } from "@/lib/auth/user-features";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type KitItem = {
  id: number;
  item_name: string;
  brand: string | null;
  category: string;
  description: string | null;
  is_essential: boolean;
  notes: string | null;
};

export default async function KitListPage() {
  const hasAccess = await userHasFeature("kit_list");

  if (!hasAccess) {
    redirect("/athlete");
  }

  const supabase = await createClient();
  const { data: kitItems, error } = await supabase
    .from("kit_list")
    .select("*")
    .order("category")
    .order("is_essential", { ascending: false });

  if (error) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}>
        <p style={{ color: "#b00020" }}>Failed to load kit list: {error.message}</p>
      </div>
    );
  }

  const items = (kitItems || []) as KitItem[];

  // Group items by category
  const groupedItems = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, KitItem[]>
  );

  const categories = Object.keys(groupedItems).sort();

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "32px" }}>
        Kit List
      </h1>

      {categories.map((category) => (
        <section
          key={category}
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e5e5e5",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "16px" }}>
            {category}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {groupedItems[category].map((item) => (
              <div
                key={item.id}
                style={{
                  borderBottom: "1px solid #f0f0f0",
                  paddingBottom: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        id={`item-${item.id}`}
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                          accentColor: "#111",
                        }}
                      />
                      <label
                        htmlFor={`item-${item.id}`}
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "pointer",
                          color: "#111",
                        }}
                      >
                        {item.item_name}
                      </label>
                      {item.is_essential && (
                        <span
                          style={{
                            display: "inline-block",
                            background: "#b00020",
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          Essential
                        </span>
                      )}
                    </div>
                    {item.brand && (
                      <p
                        style={{
                          margin: "4px 0 0 26px",
                          fontSize: "13px",
                          color: "#888",
                        }}
                      >
                        Brand: {item.brand}
                      </p>
                    )}
                    {item.description && (
                      <p
                        style={{
                          margin: "4px 0 0 26px",
                          fontSize: "13px",
                          color: "#666",
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                    {item.notes && (
                      <p
                        style={{
                          margin: "4px 0 0 26px",
                          fontSize: "12px",
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        💡 {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div
        style={{
          background: "#f9f9f9",
          borderRadius: "12px",
          border: "1px solid #e5e5e5",
          padding: "20px",
          marginTop: "32px",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
          <strong>Tip:</strong> Save this page, take a screenshot, or print it to bring
          to the store for shopping. Check off items as you acquire them!
        </p>
      </div>
    </div>
  );
}
