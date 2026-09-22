"use client";

import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type AppointmentData = {
  avatar: string;
  date: Date;
  hour: string;
  title: string;
  description: string;
  status: string;
  statusColor: "success" | "warning";
};

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();

const data: AppointmentData[] = [
  {
    avatar: "https://i.pravatar.cc/150?img=8",
    date: new Date(y, m, 1),
    hour: "10:00-11:00 AM",
    title: "General Health Check up",
    description: "Dr. Dianne Philips",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=4",
    date: new Date(y, m, 1),
    hour: "05:00-06:00 PM",
    title: "Temporary Headache",
    description: "Dr. Jenny Smith",
    status: "pending",
    statusColor: "warning"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=12",
    date: new Date(y, m, 5),
    hour: "09:00-10:00 AM",
    title: "Follow-up Visit",
    description: "Dr. John Davis",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=23",
    date: new Date(y, m, 8),
    hour: "02:00-03:00 PM",
    title: "Lab Results Review",
    description: "Dr. Sarah Wilson",
    status: "pending",
    statusColor: "warning"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=33",
    date: new Date(y, m, 8),
    hour: "11:00-12:00 PM",
    title: "Physical Therapy",
    description: "Dr. Mike Brown",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=45",
    date: new Date(y, m, 8),
    hour: "04:00-05:00 PM",
    title: "Cardiac Check",
    description: "Dr. Emma Lee",
    status: "pending",
    statusColor: "warning"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=52",
    date: new Date(y, m, 12),
    hour: "10:30-11:30 AM",
    title: "Diabetes Management",
    description: "Dr. James Taylor",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=11",
    date: new Date(y, m, 12),
    hour: "08:00-09:00 AM",
    title: "Blood Pressure Check",
    description: "Dr. Lisa Anderson",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=22",
    date: new Date(y, m, 15),
    hour: "01:00-02:00 PM",
    title: "X-Ray Review",
    description: "Dr. Robert Clark",
    status: "pending",
    statusColor: "warning"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=31",
    date: new Date(y, m, 20),
    hour: "03:00-04:00 PM",
    title: "Vaccination",
    description: "Dr. Anna Martinez",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=8",
    date: new Date(y, m, 20),
    hour: "10:00-11:00 AM",
    title: "General Health Check up",
    description: "Dr. Dianne Philips",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=12",
    date: new Date(y, m, 20),
    hour: "09:00-10:00 AM",
    title: "Follow-up Visit",
    description: "Dr. John Davis",
    status: "active",
    statusColor: "success"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=4",
    date: new Date(y, m, 24),
    hour: "05:00-06:00 PM",
    title: "Temporary Headache",
    description: "Dr. Jenny Smith",
    status: "pending",
    statusColor: "warning"
  },
  {
    avatar: "https://i.pravatar.cc/150?img=23",
    date: new Date(y, m, 24),
    hour: "02:00-03:00 PM",
    title: "Lab Results Review",
    description: "Dr. Sarah Wilson",
    status: "pending",
    statusColor: "warning"
  }
];

function isSameDay(a: Date, b: Date | undefined): boolean {
  if (!b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const datesWithAppointments = (() => {
  const seen = new Set<string>();
  return data
    .map((item) => {
      const d = new Date(item.date);
      d.setHours(0, 0, 0, 0);
      return d;
    })
    .filter((d) => {
      const key = d.getTime().toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
})();

export default function PlannedCalendar() {
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const appointmentsForSelectedDate = data.filter((item) => isSameDay(item.date, date));

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          today={new Date()}
          defaultMonth={new Date()}
          modifiers={{ hasAppointment: datesWithAppointments }}
          modifiersClassNames={{
            hasAppointment:
              "relative after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-amber-600 after:content-['']"
          }}
          className="w-full! **:[[role=gridcell]_button]:h-10! **:[[role=gridcell]]:h-10!"
        />
      </CardContent>
      <div className="flex flex-col divide-y border-t px-0">
        {appointmentsForSelectedDate.map((item, i) => (
          <div className="w-full" key={i}>
            <div className="flex items-center p-4">
              <Avatar>
                <AvatarImage src={item.avatar} />
                <AvatarFallback>AC</AvatarFallback>
              </Avatar>
              <div className="ms-4 space-y-1">
                <p className="leading-none font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">
                  {item.description} at {item.hour}
                </p>
              </div>
              <Badge variant={item.statusColor} className="ms-auto capitalize">
                {item.status}
              </Badge>
            </div>
          </div>
        ))}
        {appointmentsForSelectedDate.length === 0 && (
          <div className="text-muted-foreground px-4 py-8 text-center text-sm">
            No appointments for this day
          </div>
        )}
      </div>
    </Card>
  );
}
