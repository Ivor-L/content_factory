"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProductList } from "@/app/(main)/products/ProductList";
import { CharacterList } from "@/app/(main)/characters/CharacterList";
import { StyleLibraryHub } from "@/components/assets/StyleLibraryHub";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

const TABS = ["characters", "products", "styleLibrary"] as const;
type TabKey = (typeof TABS)[number];

type ProductListProps = React.ComponentProps<typeof ProductList>;
type CharacterListProps = React.ComponentProps<typeof CharacterList>;

type ResourceTabsProps = {
  products: ProductListProps["initialProducts"];
  characters: CharacterListProps["initialCharacters"];
};

export function ResourceTabs({ products, characters }: ResourceTabsProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("characters");
  const previousTabRef = useRef<TabKey>("characters");
  const [isTabSwitching, setIsTabSwitching] = useState(false);

  useEffect(() => {
    setIsTabSwitching(previousTabRef.current !== activeTab);
    previousTabRef.current = activeTab;
  }, [activeTab]);

  const tabLabels: Record<TabKey, string> = {
    products: t.products?.title ?? "产品库",
    characters: t.characters?.title ?? "角色库",
    styleLibrary: "风格库",
  };

  const renderContent = useMemo(() => {
    switch (activeTab) {
      case "products":
        return (
          <ProductList initialProducts={products} showHeader={false} />
        );
      case "characters":
        return (
          <CharacterList
            initialCharacters={characters}
            showHeader={false}
            showEmptyGuide={false}
          />
        );
      case "styleLibrary":
        return <StyleLibraryHub showHeader={false} />;
      default:
        return null;
    }
  }, [activeTab, products, characters]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "relative px-4 py-3 text-lg font-semibold tracking-wide text-gray-400 dark:text-gray-500 transition-all duration-200",
              activeTab === tab
                ? "text-gray-900 dark:text-white"
                : "hover:text-gray-900 dark:hover:text-white"
            )}
          >
            {tabLabels[tab]}
            {activeTab === tab && (
              <span className="absolute left-0 -bottom-[1px] w-full h-0.5 bg-gray-900 dark:bg-white" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={isTabSwitching ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={
              isTabSwitching
                ? { duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }
                : { duration: 0 }
            }
          >
            {renderContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
