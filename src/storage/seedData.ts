import type { Meal, Workout } from "../domain/types";
import { v4 as uuidv4 } from "./uuid";

export function getSeedMeals(): Meal[] {
  return [
    {
      id: uuidv4(),
      name: "Black Coffee / Water",
      tags: ["keto", "morning", "fasting"],
      ingredients: [],
      instructions: [
        "Brew black coffee (no milk, sugar, or cream) or prepare cold water.",
        "No calories if not hungry – keep it clean.",
        "Aim for 3–4L of water throughout the day.",
      ],
      prepTimeMins: 0,
      cookTimeMins: 0,
    },
    {
      id: uuidv4(),
      name: "Joe's Keto Pizza (Fathead / Almond Flour)",
      tags: ["keto", "pizza", "fathead"],
      ingredients: [
        { id: uuidv4(), name: "Mozzarella cheese", quantity: "170g", store: "Coles" },
        { id: uuidv4(), name: "Cream cheese", quantity: "2 tbsp", store: "Coles" },
        { id: uuidv4(), name: "Almond flour", quantity: "3/4 cup", store: "Coles" },
        { id: uuidv4(), name: "Egg", quantity: "1", store: "Coles" },
        { id: uuidv4(), name: "Pizza sauce (sugar-free)", quantity: "1/4 cup", store: "Coles" },
        { id: uuidv4(), name: "Toppings (pepperoni, mushrooms, etc)", quantity: "as desired", store: "Coles" },
      ],
      instructions: [
        "Preheat oven to 200°C (400°F)",
        "Melt mozzarella and cream cheese in microwave (1 min intervals, stirring)",
        "Mix in almond flour and egg until dough forms",
        "Roll out dough on parchment paper into pizza shape",
        "Bake crust for 12-15 minutes until golden",
        "Add sauce and toppings, bake another 5-7 minutes",
      ],
      prepTimeMins: 15,
      cookTimeMins: 25,
    },
    {
      id: uuidv4(),
      name: "250g Mince Taco Bowl",
      tags: ["keto", "mexican", "beef"],
      ingredients: [
        { id: uuidv4(), name: "Beef mince", quantity: "250g", store: "Coles" },
        { id: uuidv4(), name: "Taco seasoning (low-carb)", quantity: "2 tbsp", store: "Coles" },
        { id: uuidv4(), name: "Lettuce", quantity: "2 cups shredded", store: "Coles" },
        { id: uuidv4(), name: "Shredded cheese", quantity: "1/4 cup", store: "Coles" },
        { id: uuidv4(), name: "Sour cream", quantity: "2 tbsp", store: "Coles" },
        { id: uuidv4(), name: "Avocado", quantity: "1/2", store: "Coles" },
        { id: uuidv4(), name: "Tomato", quantity: "1 small, diced", store: "Coles" },
      ],
      instructions: [
        "Brown the beef mince in a pan over medium heat",
        "Add taco seasoning and a splash of water, simmer 5 minutes",
        "In a bowl, layer lettuce as base",
        "Add seasoned beef on top",
        "Top with cheese, sour cream, avocado, and tomato",
        "Mix and enjoy!",
      ],
      prepTimeMins: 5,
      cookTimeMins: 10,
    },
    {
      id: uuidv4(),
      name: "Salmon Salad",
      tags: ["keto", "salad", "fish"],
      ingredients: [
        { id: uuidv4(), name: "Salmon fillet", quantity: "200g", store: "Coles" },
        { id: uuidv4(), name: "Mixed salad greens", quantity: "3 cups", store: "Coles" },
        { id: uuidv4(), name: "Cherry tomatoes", quantity: "10", store: "Coles" },
        { id: uuidv4(), name: "Cucumber", quantity: "1/2", store: "Coles" },
        { id: uuidv4(), name: "Olive oil", quantity: "2 tbsp", store: "Coles" },
        { id: uuidv4(), name: "Lemon juice", quantity: "1 tbsp", store: "Coles" },
        { id: uuidv4(), name: "Feta cheese", quantity: "50g", store: "Coles" },
      ],
      instructions: [
        "Season salmon with salt and pepper",
        "Pan-fry salmon in 1 tbsp olive oil for 4-5 minutes each side",
        "Let salmon rest, then flake into chunks",
        "Toss salad greens, tomatoes, and cucumber in a bowl",
        "Add flaked salmon on top",
        "Drizzle with remaining olive oil and lemon juice",
        "Crumble feta cheese over the top",
      ],
      prepTimeMins: 10,
      cookTimeMins: 10,
    },
  ];
}

export function getSeedWorkouts(): Workout[] {
  return [
    {
      id: uuidv4(),
      name: "Workout A",
      exercises: [
        {
          id: uuidv4(),
          name: "Goblet Squats",
          sets: 4,
          reps: "8-12",
          notes: "Hold a dumbbell; full range of motion",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Bench Press (or floor press)",
          sets: 4,
          reps: "8-12",
        },
        {
          id: uuidv4(),
          name: "One-Arm Dumbbell Row",
          sets: 3,
          reps: "10-12",
          notes: "Each side",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Romanian Deadlift",
          sets: 3,
          reps: "8-12",
        },
        {
          id: uuidv4(),
          name: "Overhead Dumbbell Press",
          sets: 3,
          reps: "8-12",
        },
        {
          id: uuidv4(),
          name: "Plank (optional finisher)",
          sets: 2,
          reps: "45-60 sec",
          notes: "Optional",
        },
      ],
    },
    {
      id: uuidv4(),
      name: "Workout B",
      exercises: [
        {
          id: uuidv4(),
          name: "Bulgarian Split Squats",
          sets: 3,
          reps: "8-10",
          notes: "Each leg",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Incline or Push-Ups",
          sets: 3,
          reps: "8-12",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Row (different grip than A)",
          sets: 3,
          reps: "10-12",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Hip Thrust or Glute Bridge",
          sets: 3,
          reps: "10-15",
        },
        {
          id: uuidv4(),
          name: "Dumbbell Lateral Raises",
          sets: 3,
          reps: "12-15",
        },
        {
          id: uuidv4(),
          name: "Farmer's carry (optional finisher)",
          sets: 2,
          reps: "1 round",
          notes: "Optional",
        },
      ],
    },
  ];
}
