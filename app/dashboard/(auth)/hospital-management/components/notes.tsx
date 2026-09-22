"use client";

import * as React from "react";
import { format } from "date-fns";
import { Clock, PlusCircle, Trash2 } from "lucide-react";
import Link from "next/link";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Note {
  id: number;
  date: Date;
  text: string;
}

export default function Notes() {
  const [notes, setNotes] = React.useState<Note[]>([
    { id: 1, date: new Date(2025, 10, 15), text: "Dr. Smith's surgery at 10 AM" },
    { id: 2, date: new Date(2025, 4, 15), text: "Staff meeting at 2 PM" },
    { id: 3, date: new Date(2025, 2, 16), text: "New patient orientation" },
    { id: 4, date: new Date(2025, 1, 16), text: "Inventory check" },
    { id: 5, date: new Date(2025, 2, 15), text: "Staff meeting at 2 PM" },
    { id: 6, date: new Date(2025, 3, 15), text: "Staff meeting at 2 PM" },
    { id: 7, date: new Date(2025, 5, 20), text: "Annual health checkup" }
  ]);
  const [newNote, setNewNote] = React.useState("");

  const addNote = () => {
    if (newNote.trim()) {
      const newNoteObj: Note = {
        id: Date.now(),
        date: new Date(),
        text: newNote.trim()
      };
      setNotes([...notes, newNoteObj]);
      setNewNote("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {notes.map((note, key) => (
            <Link
              href="#"
              key={key}
              className="group flex h-12 justify-between py-3 text-sm hover:opacity-70">
              <span>{note.text}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs lg:group-hover:hidden">
                  <Clock className="size-3" /> {format(note.date, "MMM d, yyyy")}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  className="lg:hidden group-hover:inline-flex">
                  <Trash2 />
                </Button>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <InputGroup>
          <InputGroupInput
            placeholder="Add a new note"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && addNote()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="secondary" onClick={addNote}>
              <PlusCircle />
              Add
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </CardFooter>
    </Card>
  );
}
