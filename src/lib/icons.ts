export type IconCategory = "animals" | "creatures" | "fantasy" | "humans";

export interface IconEntry {
  id: string;
  category: IconCategory;
  name: string;
  path: string;
}

export const ICON_CATEGORIES: { id: IconCategory; label: string }[] = [
  { id: "humans", label: "Humans" },
  { id: "fantasy", label: "Fantasy" },
  { id: "creatures", label: "Creatures" },
  { id: "animals", label: "Animals" },
];

export const ICONS: IconEntry[] = [
  // Humans
  { id: "humans/fighter", category: "humans", name: "Fighter", path: "/icons/humans/fighter.png" },
  { id: "humans/wizard", category: "humans", name: "Wizard", path: "/icons/humans/wizard.png" },
  { id: "humans/rogue", category: "humans", name: "Rogue", path: "/icons/humans/rogue.png" },
  { id: "humans/cleric", category: "humans", name: "Cleric", path: "/icons/humans/cleric.png" },
  { id: "humans/ranger", category: "humans", name: "Ranger", path: "/icons/humans/ranger.png" },
  { id: "humans/paladin", category: "humans", name: "Paladin", path: "/icons/humans/paladin.png" },
  { id: "humans/bard", category: "humans", name: "Bard", path: "/icons/humans/bard.png" },
  { id: "humans/monk", category: "humans", name: "Monk", path: "/icons/humans/monk.png" },
  { id: "humans/barbarian", category: "humans", name: "Barbarian", path: "/icons/humans/barbarian.png" },
  { id: "humans/druid", category: "humans", name: "Druid", path: "/icons/humans/druid.png" },
  { id: "humans/sorcerer", category: "humans", name: "Sorcerer", path: "/icons/humans/sorcerer.png" },
  { id: "humans/warlock", category: "humans", name: "Warlock", path: "/icons/humans/warlock.png" },
  { id: "humans/knight", category: "humans", name: "Knight", path: "/icons/humans/knight.png" },
  { id: "humans/archer", category: "humans", name: "Archer", path: "/icons/humans/archer.png" },
  { id: "humans/assassin", category: "humans", name: "Assassin", path: "/icons/humans/assassin.png" },
  { id: "humans/mage", category: "humans", name: "Mage", path: "/icons/humans/mage.png" },
  { id: "humans/merchant", category: "humans", name: "Merchant", path: "/icons/humans/merchant.png" },
  { id: "humans/guard", category: "humans", name: "Guard", path: "/icons/humans/guard.png" },
  { id: "humans/priest", category: "humans", name: "Priest", path: "/icons/humans/priest.png" },
  { id: "humans/noble", category: "humans", name: "Noble", path: "/icons/humans/noble.png" },

  // Fantasy races
  { id: "fantasy/elf", category: "fantasy", name: "Elf", path: "/icons/fantasy/elf.png" },
  { id: "fantasy/dark-elf", category: "fantasy", name: "Dark Elf", path: "/icons/fantasy/dark-elf.png" },
  { id: "fantasy/dwarf", category: "fantasy", name: "Dwarf", path: "/icons/fantasy/dwarf.png" },
  { id: "fantasy/orc", category: "fantasy", name: "Orc", path: "/icons/fantasy/orc.png" },
  { id: "fantasy/halfling", category: "fantasy", name: "Halfling", path: "/icons/fantasy/halfling.png" },
  { id: "fantasy/gnome", category: "fantasy", name: "Gnome", path: "/icons/fantasy/gnome.png" },
  { id: "fantasy/tiefling", category: "fantasy", name: "Tiefling", path: "/icons/fantasy/tiefling.png" },
  { id: "fantasy/dragonborn", category: "fantasy", name: "Dragonborn", path: "/icons/fantasy/dragonborn.png" },
  { id: "fantasy/half-orc", category: "fantasy", name: "Half-Orc", path: "/icons/fantasy/half-orc.png" },
  { id: "fantasy/aasimar", category: "fantasy", name: "Aasimar", path: "/icons/fantasy/aasimar.png" },
  { id: "fantasy/goblin", category: "fantasy", name: "Goblin", path: "/icons/fantasy/goblin.png" },
  { id: "fantasy/hobgoblin", category: "fantasy", name: "Hobgoblin", path: "/icons/fantasy/hobgoblin.png" },
  { id: "fantasy/gnoll", category: "fantasy", name: "Gnoll", path: "/icons/fantasy/gnoll.png" },
  { id: "fantasy/lizardfolk", category: "fantasy", name: "Lizardfolk", path: "/icons/fantasy/lizardfolk.png" },
  { id: "fantasy/catfolk", category: "fantasy", name: "Catfolk", path: "/icons/fantasy/catfolk.png" },
  { id: "fantasy/tabaxi", category: "fantasy", name: "Tabaxi", path: "/icons/fantasy/tabaxi.png" },
  { id: "fantasy/kenku", category: "fantasy", name: "Kenku", path: "/icons/fantasy/kenku.png" },
  { id: "fantasy/firbolg", category: "fantasy", name: "Firbolg", path: "/icons/fantasy/firbolg.png" },
  { id: "fantasy/genasi", category: "fantasy", name: "Genasi", path: "/icons/fantasy/genasi.png" },
  { id: "fantasy/yuan-ti", category: "fantasy", name: "Yuan-ti", path: "/icons/fantasy/yuan-ti.png" },
  { id: "fantasy/triton", category: "fantasy", name: "Triton", path: "/icons/fantasy/triton.png" },

  // Creatures
  { id: "creatures/dragon", category: "creatures", name: "Dragon", path: "/icons/creatures/dragon.png" },
  { id: "creatures/skeleton", category: "creatures", name: "Skeleton", path: "/icons/creatures/skeleton.png" },
  { id: "creatures/zombie", category: "creatures", name: "Zombie", path: "/icons/creatures/zombie.png" },
  { id: "creatures/golem", category: "creatures", name: "Golem", path: "/icons/creatures/golem.png" },
  { id: "creatures/vampire", category: "creatures", name: "Vampire", path: "/icons/creatures/vampire.png" },
  { id: "creatures/werewolf", category: "creatures", name: "Werewolf", path: "/icons/creatures/werewolf.png" },
  { id: "creatures/troll", category: "creatures", name: "Troll", path: "/icons/creatures/troll.png" },
  { id: "creatures/ogre", category: "creatures", name: "Ogre", path: "/icons/creatures/ogre.png" },
  { id: "creatures/minotaur", category: "creatures", name: "Minotaur", path: "/icons/creatures/minotaur.png" },
  { id: "creatures/harpy", category: "creatures", name: "Harpy", path: "/icons/creatures/harpy.png" },
  { id: "creatures/lich", category: "creatures", name: "Lich", path: "/icons/creatures/lich.png" },
  { id: "creatures/beholder", category: "creatures", name: "Beholder", path: "/icons/creatures/beholder.png" },
  { id: "creatures/owlbear", category: "creatures", name: "Owlbear", path: "/icons/creatures/owlbear.png" },
  { id: "creatures/basilisk", category: "creatures", name: "Basilisk", path: "/icons/creatures/basilisk.png" },
  { id: "creatures/hydra", category: "creatures", name: "Hydra", path: "/icons/creatures/hydra.png" },
  { id: "creatures/manticore", category: "creatures", name: "Manticore", path: "/icons/creatures/manticore.png" },
  { id: "creatures/wyvern", category: "creatures", name: "Wyvern", path: "/icons/creatures/wyvern.png" },
  { id: "creatures/chimera", category: "creatures", name: "Chimera", path: "/icons/creatures/chimera.png" },
  { id: "creatures/griffon", category: "creatures", name: "Griffon", path: "/icons/creatures/griffon.png" },
  { id: "creatures/phoenix", category: "creatures", name: "Phoenix", path: "/icons/creatures/phoenix.png" },

  // Animals
  { id: "animals/cat", category: "animals", name: "Cat", path: "/icons/animals/cat.png" },
  { id: "animals/bird", category: "animals", name: "Bird", path: "/icons/animals/bird.png" },
  { id: "animals/lizard", category: "animals", name: "Lizard", path: "/icons/animals/lizard.png" },
  { id: "animals/bear", category: "animals", name: "Bear", path: "/icons/animals/bear.png" },
  { id: "animals/wolf", category: "animals", name: "Wolf", path: "/icons/animals/wolf.png" },
  { id: "animals/lion", category: "animals", name: "Lion", path: "/icons/animals/lion.png" },
  { id: "animals/eagle", category: "animals", name: "Eagle", path: "/icons/animals/eagle.png" },
  { id: "animals/boar", category: "animals", name: "Boar", path: "/icons/animals/boar.png" },
  { id: "animals/panther", category: "animals", name: "Panther", path: "/icons/animals/panther.png" },
  { id: "animals/horse", category: "animals", name: "Horse", path: "/icons/animals/horse.png" },
  { id: "animals/snake", category: "animals", name: "Snake", path: "/icons/animals/snake.png" },
  { id: "animals/crocodile", category: "animals", name: "Crocodile", path: "/icons/animals/crocodile.png" },
  { id: "animals/spider", category: "animals", name: "Spider", path: "/icons/animals/spider.png" },
  { id: "animals/rat", category: "animals", name: "Giant Rat", path: "/icons/animals/rat.png" },
  { id: "animals/bat", category: "animals", name: "Bat", path: "/icons/animals/bat.png" },
  { id: "animals/shark", category: "animals", name: "Shark", path: "/icons/animals/shark.png" },
  { id: "animals/tiger", category: "animals", name: "Tiger", path: "/icons/animals/tiger.png" },
  { id: "animals/elephant", category: "animals", name: "Elephant", path: "/icons/animals/elephant.png" },
  { id: "animals/scorpion", category: "animals", name: "Scorpion", path: "/icons/animals/scorpion.png" },
  { id: "animals/hawk", category: "animals", name: "Hawk", path: "/icons/animals/hawk.png" },
  { id: "animals/frog", category: "animals", name: "Giant Frog", path: "/icons/animals/frog.png" },
  { id: "animals/octopus", category: "animals", name: "Octopus", path: "/icons/animals/octopus.png" },
  { id: "animals/ape", category: "animals", name: "Ape", path: "/icons/animals/ape.png" },
];

export function getIconsByCategory(category: IconCategory): IconEntry[] {
  return ICONS.filter((icon) => icon.category === category);
}
