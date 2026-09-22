import { generateMeta } from "@/lib/utils";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

import CustomDateRangePicker from "@/components/custom-date-range-picker";
import { EcommerceWelcomeCard } from "./components/welcome";
import StatCards from "./components/stat-cards";
import { EcommerceTotalRevenueCard } from "./components/total-revenue";
import { EcommerceReturnRateCard } from "./components/return-rate";
import { EcommerceSalesByLocationCard } from "./components/sales-by-location";
import { EcommerceVisitBySourceCard } from "./components/visit-by-source";
import { EcommerceCustomerReviewsCard } from "./components/customer-reviews";
import { EcommerceRecentOrdersCard } from "./components/recent-orders";
import { EcommerceBestSellingProductsCard } from "./components/best-selling-products";

export async function generateMetadata() {
  return generateMeta({
    title: "Ecommerce Admin Dashboard",
    description:
      "The e-commerce admin dashboard template is an admin template that you can use for your e-commerce website projects. Built with shadcn/ui, Tailwind CSS, Next.js.",
    canonical: "/ecommerce"
  });
}

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">E-Commerce Dashboard</h1>
        <div className="flex items-center space-x-2">
          <CustomDateRangePicker />
          <Button>
            <Download />
            <span className="hidden lg:inline">Download</span>
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-12">
          <EcommerceWelcomeCard />
          <div className="md:col-span-12 lg:col-span-8">
            <StatCards />
          </div>
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
          <EcommerceTotalRevenueCard />
          <EcommerceReturnRateCard />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <EcommerceSalesByLocationCard />
          <EcommerceVisitBySourceCard />
          <EcommerceCustomerReviewsCard />
        </div>
        <div className="space-y-4 xl:grid xl:grid-cols-12 xl:gap-4 xl:space-y-0">
          <EcommerceRecentOrdersCard />
          <EcommerceBestSellingProductsCard />
        </div>
      </div>
    </div>
  );
}
