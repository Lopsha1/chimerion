import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { HomePage } from "./pages/Home";
import { ZonesPage } from "./pages/Zones";
import { PricesPage } from "./pages/Prices";
import { HallPage } from "./pages/Hall";
import { OffersPage } from "./pages/Offers";
import { ContactsPage } from "./pages/Contacts";
import { BookPage } from "./pages/Book";
import { VisitPage } from "./pages/Visit";
import { AdminPage } from "./pages/Admin";

export function App() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/zones" element={<ZonesPage />} />
      <Route path="/prices" element={<PricesPage />} />
      <Route path="/hall" element={<HallPage />} />
      <Route path="/offers" element={<OffersPage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/book" element={<BookPage />} />
      <Route path="/visit/:token" element={<VisitPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
