import { CategoryRepository, AccountRepository, UserSettingsRepository } from './repositories';

export async function seedDatabaseIfNeeded() {
  // Categories
  const categories = await CategoryRepository.getAll();
  if (categories.length === 0) {
    console.log("Seeding categories...");
    const defaults = [
      { emoji: "🍔", name: "Food" },
      { emoji: "🛒", name: "Groceries" },
      { emoji: "🚕", name: "Transport" },
      { emoji: "🏠", name: "Rent" },
      { emoji: "🎉", name: "Fun" }
    ];
    for (const [index, pair] of defaults.entries()) {
      await CategoryRepository.create({ name: pair.name, emoji: pair.emoji, sortIndex: index, isSystem: false });
    }
    // System
    await CategoryRepository.create({ name: "System · Adjustment", emoji: "🛠", sortIndex: 9999, isSystem: true });
    await CategoryRepository.create({ name: "System · Transfer", emoji: "⇅", sortIndex: 9999, isSystem: true });
  }

  // Accounts
  const accounts = await AccountRepository.getAll();
  if (accounts.length === 0) {
    console.log("Seeding default account...");
    const cash = await AccountRepository.create({ name: "Cash", emoji: "💵", kind: "cash", sortIndex: 0 });
    // Default account ID stored in UserSettings
    await UserSettingsRepository.update({ defaultAccountId: cash.id });
  }
}
